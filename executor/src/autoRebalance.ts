/**
 * autoRebalance.ts — Automatic Vault Rebalance Watcher & Retrier with 20-attempt resilience
 *
 * Periodically monitors ParentVault on Coston2 testnet. If idle assets exceed
 * rebalanceThreshold, it automatically invokes requestRebalance() on-chain with
 * up to 20 retry attempts to overcome network jitter or tunnel packet drops.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  type Chain,
  formatUnits,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

const coston2: Chain = {
  id: 114,
  name: 'Flare Coston2',
  nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: { default: { http: ['https://coston2-api.flare.network/ext/C/rpc'] } },
  blockExplorers: {
    default: { name: 'Coston2 Explorer', url: 'https://coston2-explorer.flare.network' },
  },
};

const PARENT_VAULT_ABI = [
  {
    type: 'function', name: 'rebalanceThreshold', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'asset', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'requestRebalance', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface AutoRebalanceConfig {
  rpcUrl: string;
  executorPrivateKey: `0x${string}`;
  parentVaultAddress: Address;
  maxRetries?: number;
  checkIntervalMs?: number;
}

export class AutoRebalanceWatcher {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly account: PrivateKeyAccount;
  private readonly parentVault: Address;
  private readonly maxRetries: number;
  private readonly checkIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(config: AutoRebalanceConfig) {
    this.account = privateKeyToAccount(config.executorPrivateKey);
    this.parentVault = config.parentVaultAddress;
    this.maxRetries = config.maxRetries ?? 20;
    this.checkIntervalMs = config.checkIntervalMs ?? 30000;

    this.publicClient = createPublicClient({
      chain: coston2,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      chain: coston2,
      transport: http(config.rpcUrl),
      account: this.account,
    });

    console.log(`[AutoRebalance] Initialized for vault ${this.parentVault} (Max retries: ${this.maxRetries})`);
  }

  /** Start periodic watcher loop */
  public start(): void {
    if (this.timer) return;
    console.log(`[AutoRebalance] Starting watcher loop (interval: ${this.checkIntervalMs}ms)`);
    this.timer = setInterval(() => {
      this.checkAndRebalance().catch((err) => {
        console.error('[AutoRebalance] Check error:', err.message || err);
      });
    }, this.checkIntervalMs);

    // Initial check immediately
    this.checkAndRebalance().catch((err) => {
      console.error('[AutoRebalance] Initial check error:', err.message || err);
    });
  }

  /** Stop watcher loop */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[AutoRebalance] Stopped watcher loop');
    }
  }

  /**
   * Checks vault idle assets and triggers rebalance with up to 20 retries if threshold met.
   */
  public async checkAndRebalance(): Promise<boolean> {
    if (this.isChecking) return false;
    this.isChecking = true;

    try {
      const threshold = await this.publicClient.readContract({
        address: this.parentVault,
        abi: PARENT_VAULT_ABI,
        functionName: 'rebalanceThreshold',
      });

      const assetAddr = await this.publicClient.readContract({
        address: this.parentVault,
        abi: PARENT_VAULT_ABI,
        functionName: 'asset',
      });

      const idleAssets = await this.publicClient.readContract({
        address: assetAddr,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.parentVault],
      });

      console.log(
        `[AutoRebalance] Vault check — Idle: ${formatUnits(idleAssets, 18)} FXRP, ` +
        `Threshold: ${formatUnits(threshold, 18)} FXRP`
      );

      if (idleAssets < threshold) {
        return false;
      }

      console.log(`[AutoRebalance] 🚀 Idle assets (${formatUnits(idleAssets, 18)}) >= threshold (${formatUnits(threshold, 18)}). Triggering rebalance!`);
      return await this.triggerRebalanceWithRetry();
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Execute requestRebalance() on-chain with up to maxRetries attempts.
   */
  public async triggerRebalanceWithRetry(): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[AutoRebalance] Sending requestRebalance() on-chain (attempt ${attempt}/${this.maxRetries})...`);

        const hash = await this.walletClient.writeContract({
          chain: coston2,
          account: this.account,
          address: this.parentVault,
          abi: PARENT_VAULT_ABI,
          functionName: 'requestRebalance',
        });

        console.log(`[AutoRebalance] Tx submitted: ${hash} — waiting for receipt...`);
        const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          console.log(`[AutoRebalance] ✅ requestRebalance() succeeded in block ${receipt.blockNumber}! (Attempt ${attempt})`);
          console.log(`[AutoRebalance]    Explorer: https://coston2-explorer.flare.network/tx/${hash}`);
          return true;
        } else {
          throw new Error(`Transaction reverted: ${hash}`);
        }
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[AutoRebalance] Attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}`);
        if (attempt < this.maxRetries) {
          // Wait 1 second before retrying
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    console.error(`[AutoRebalance] ❌ Failed to trigger rebalance after ${this.maxRetries} attempts:`, lastError?.message);
    return false;
  }
}
