/**
 * flareExecutor.ts — Bridges a detected XRPL payment into the Flare Coston2
 * FAssetAdapter by:
 *
 *   1.  Validating the destination tag is registered on-chain.
 *   2.  Checking that the tag doesn't already have a pending deposit.
 *   3.  Transferring test FXRP to the FAssetAdapter (simulates Flare AssetManager
 *       minting; on mainnet step 3 would call AssetManager.executeDirectMinting).
 *   4.  Reading the exact unallocated FXRP balance to satisfy the strict equality
 *       check in processDirectMint().
 *   5.  Calling FAssetAdapter.processDirectMint(tag, depositId, observedMintedAmount).
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  type Address,
  type PublicClient,
  type WalletClient,
  type Chain,
  formatUnits,
  parseUnits,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { DetectedPayment } from './xrplWatcher.js';
import type { ProcessedTxStore } from './store.js';

// ── Coston2 chain definition ───────────────────────────────────────────

const coston2: Chain = {
  id: 114,
  name: 'Flare Coston2',
  nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: { default: { http: ['https://coston2-api.flare.network/ext/C/rpc'] } },
  blockExplorers: {
    default: { name: 'Coston2 Explorer', url: 'https://coston2-explorer.flare.network' },
  },
};

// ── Contract ABIs (minimal, only what we need) ─────────────────────────

const FASSET_ADAPTER_ABI = [
  {
    type: 'function', name: 'tagUser', stateMutability: 'view',
    inputs: [{ name: 'tag', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'tagExecutor', stateMutability: 'view',
    inputs: [{ name: 'tag', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'pendingDepositForTag', stateMutability: 'view',
    inputs: [{ name: 'tag', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'totalPendingFAssets', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'processDirectMint', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tag', type: 'uint256' },
      { name: 'depositId', type: 'bytes32' },
      { name: 'observedMintedAmount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'decimals', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ── Types ──────────────────────────────────────────────────────────────

export interface FlareExecutorConfig {
  rpcUrl: string;
  executorPrivateKey: `0x${string}`;
  fAssetAdapterAddress: Address;
  fxrpAddress: Address;
}

// ── Executor class ─────────────────────────────────────────────────────

export class FlareExecutor {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly account: PrivateKeyAccount;
  private readonly fAssetAdapter: Address;
  private readonly fxrp: Address;
  private fxrpDecimals: number | null = null;

  constructor(private readonly config: FlareExecutorConfig) {
    this.account = privateKeyToAccount(config.executorPrivateKey);
    this.fAssetAdapter = config.fAssetAdapterAddress;
    this.fxrp = config.fxrpAddress;

    this.publicClient = createPublicClient({
      chain: coston2,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      chain: coston2,
      transport: http(config.rpcUrl),
      account: this.account,
    });

    console.log(`[Flare] Executor address: ${this.account.address}`);
  }

  /** Lazily fetch and cache FXRP decimals. */
  private async getDecimals(): Promise<number> {
    if (this.fxrpDecimals !== null) return this.fxrpDecimals;
    this.fxrpDecimals = await this.publicClient.readContract({
      address: this.fxrp,
      abi: ERC20_ABI,
      functionName: 'decimals',
    });
    console.log(`[Flare] FXRP decimals: ${this.fxrpDecimals}`);
    return this.fxrpDecimals;
  }

  /**
   * Process a single detected XRPL payment end-to-end.
   * Returns true if processDirectMint was successfully called.
   */
  async processPayment(payment: DetectedPayment, store: ProcessedTxStore): Promise<boolean> {
    const { xrplTxHash, destinationTag, amountDrops } = payment;

    const logPrefix = `[Flare][Tag ${destinationTag}]`;

    // ── 0. Local idempotency check ─────────────────────────────────
    if (store.has(xrplTxHash)) {
      console.log(`${logPrefix} Already processed XRPL tx ${xrplTxHash.slice(0, 12)}… — skipping.`);
      return false;
    }

    // ── 1. Validate tag is registered ──────────────────────────────
    const tagUser = await this.publicClient.readContract({
      address: this.fAssetAdapter,
      abi: FASSET_ADAPTER_ABI,
      functionName: 'tagUser',
      args: [BigInt(destinationTag)],
    });

    if (tagUser === '0x0000000000000000000000000000000000000000') {
      console.warn(`${logPrefix} Tag not registered on FAssetAdapter — skipping.`);
      return false;
    }
    console.log(`${logPrefix} Tag belongs to user ${tagUser}`);

    // ── 2. Check tag doesn't already have a pending deposit ────────
    const existingDeposit = await this.publicClient.readContract({
      address: this.fAssetAdapter,
      abi: FASSET_ADAPTER_ABI,
      functionName: 'pendingDepositForTag',
      args: [BigInt(destinationTag)],
    });

    if (existingDeposit !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.warn(`${logPrefix} Tag already has a pending deposit (${existingDeposit}) — skipping.`);
      return false;
    }

    // ── 3. Provision FXRP to the FAssetAdapter ─────────────────────
    //
    // On mainnet: call AssetManager.executeDirectMinting() which mints
    // FXRP to the adapter.  On testnet: we simulate by transferring
    // test FXRP from the executor wallet.
    //
    // XRP uses 6 decimal places (drops).  FXRP may use different decimals.
    // We convert the XRP amount to FXRP at 1:1 rate for testnet.

    const decimals = await this.getDecimals();
    const xrpAmount = Number(amountDrops) / 1_000_000; // drops → XRP
    const fxrpAmount = parseUnits(xrpAmount.toFixed(decimals), decimals);

    console.log(`${logPrefix} Provisioning ${formatUnits(fxrpAmount, decimals)} FXRP to FAssetAdapter...`);

    // Check current balances
    const [executorBalance, adapterBalance, totalPending] = await Promise.all([
      this.publicClient.readContract({
        address: this.fxrp,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.account.address],
      }),
      this.publicClient.readContract({
        address: this.fxrp,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.fAssetAdapter],
      }),
      this.publicClient.readContract({
        address: this.fAssetAdapter,
        abi: FASSET_ADAPTER_ABI,
        functionName: 'totalPendingFAssets',
      }),
    ]);

    const availableAdapterFxrp = adapterBalance > totalPending ? adapterBalance - totalPending : 0n;

    if (executorBalance >= fxrpAmount) {
      // Transfer FXRP from executor to FAssetAdapter
      console.log(`${logPrefix} Transferring ${formatUnits(fxrpAmount, decimals)} FXRP to FAssetAdapter...`);
      let transferReceipt: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const transferHash = await this.walletClient.writeContract({
            chain: coston2,
            account: this.account,
            address: this.fxrp,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [this.fAssetAdapter, fxrpAmount],
          });

          console.log(`${logPrefix} FXRP transfer tx: ${transferHash}`);
          transferReceipt = await this.publicClient.waitForTransactionReceipt({ hash: transferHash });
          break;
        } catch (err: any) {
          console.warn(`${logPrefix} FXRP transfer attempt ${attempt}/3 failed (${err.shortMessage ?? err.message ?? err})`);
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            return false;
          }
        }
      }

      if (transferReceipt?.status !== 'success') {
        console.error(`${logPrefix} FXRP transfer REVERTED.`);
        return false;
      }
      console.log(`${logPrefix} FXRP transfer confirmed in block ${transferReceipt.blockNumber}.`);
    } else if (availableAdapterFxrp >= fxrpAmount) {
      console.log(`${logPrefix} FAssetAdapter already has ${formatUnits(availableAdapterFxrp, decimals)} unallocated FXRP available — using existing balance.`);
    } else {
      console.error('');
      console.error('╔═══════════════════════════════════════════════════════════════════════════╗');
      console.error('║ ⚠️  INSUFFICIENT FXRP TO PROCESS MINT!                                    ║');
      console.error('║                                                                           ║');
      console.error(`║ Executor Wallet : ${this.account.address}`);
      console.error(`║ Wallet FXRP     : ${formatUnits(executorBalance, decimals)} FXRP`);
      console.error(`║ Required       : ${formatUnits(fxrpAmount, decimals)} FXRP (for Tag ${destinationTag})`);
      console.error('║                                                                           ║');
      console.error('║ 👉 ACTION REQUIRED:                                                       ║');
      console.error(`║ Request testnet FXRP for address ${this.account.address} from:`);
      console.error('║ 🔗 https://faucet.flare.network/coston2                                   ║');
      console.error('╚═══════════════════════════════════════════════════════════════════════════╝');
      console.error('');
      return false;
    }

    // ── 4. Read exact unallocated balance ──────────────────────────
    //
    // processDirectMint() requires: observedMintedAmount == (balanceOf - totalPendingFAssets)
    // We read BOTH values and compute the delta to match exactly.

    const finalAdapterBalance = await this.publicClient.readContract({
      address: this.fxrp,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.fAssetAdapter],
    });
    const finalTotalPending = await this.publicClient.readContract({
      address: this.fAssetAdapter,
      abi: FASSET_ADAPTER_ABI,
      functionName: 'totalPendingFAssets',
    });

    const observedMintedAmount = finalAdapterBalance - finalTotalPending;

    if (observedMintedAmount <= 0n) {
      console.error(
        `${logPrefix} Balance anomaly: adapterBalance=${adapterBalance}, totalPending=${totalPending}. ` +
        `Possible dust griefing — check FAssetAdapter for unexpected token transfers.`
      );
      return false;
    }

    console.log(
      `${logPrefix} Observed minted amount: ${formatUnits(observedMintedAmount, decimals)} FXRP ` +
      `(balance=${formatUnits(adapterBalance, decimals)}, pending=${formatUnits(totalPending, decimals)})`
    );

    // ── 5. Call processDirectMint() ────────────────────────────────

    // Validate and normalize XRPL tx hash format
    const clean = xrplTxHash.trim().replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
      throw new Error(`Malformed XRPL tx hash: ${xrplTxHash}`);
    }
    const depositId = keccak256(`0x${clean}`);
    
    console.log(`${logPrefix} depositId: ${depositId}`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`${logPrefix} Calling processDirectMint(${destinationTag}, ${depositId}, ${observedMintedAmount}) (attempt ${attempt}/3)...`);
        const mintHash = await this.walletClient.writeContract({
          chain: coston2,
          account: this.account,
          address: this.fAssetAdapter,
          abi: FASSET_ADAPTER_ABI,
          functionName: 'processDirectMint',
          args: [BigInt(destinationTag), depositId as `0x${string}`, observedMintedAmount],
        });

        console.log(`${logPrefix} processDirectMint tx: ${mintHash}`);
        const mintReceipt = await this.publicClient.waitForTransactionReceipt({ hash: mintHash });

        if (mintReceipt.status !== 'success') {
          console.error(`${logPrefix} processDirectMint REVERTED. Check explorer: ${mintHash}`);
          return false;
        }

        console.log(`${logPrefix} ✅ processDirectMint confirmed in block ${mintReceipt.blockNumber}!`);
        console.log(`${logPrefix}    Explorer: https://coston2-explorer.flare.network/tx/${mintHash}`);

        // ── 6. Persist ────────────────────────────────────────────────
        store.add(xrplTxHash, destinationTag);
        console.log(`${logPrefix} Recorded in local store. Total processed: ${store.count}`);

        return true;
      } catch (err: any) {
        console.error(`${logPrefix} processDirectMint attempt ${attempt}/3 failed:`, err.shortMessage ?? err.message ?? err);

        // Parse common revert reasons for helpful debugging
        const msg = String(err.message ?? '');
        if (msg.includes('NotTagExecutor')) {
          console.error(`${logPrefix} ↳ The executor address (${this.account.address}) is not authorized for this tag.`);
        } else if (msg.includes('TagExecutorNotActive')) {
          console.error(`${logPrefix} ↳ The executor is set locally but not yet active on MintingTagManager (cooldown?).`);
        } else if (msg.includes('UnexpectedMintBalance')) {
          console.error(`${logPrefix} ↳ Balance mismatch — possible dust/griefing on the adapter, or a race condition.`);
        } else if (msg.includes('DirectMintAlreadyProcessed')) {
          console.error(`${logPrefix} ↳ This depositId was already processed on-chain (idempotency guard).`);
          store.add(xrplTxHash, destinationTag); // mark locally too
          return true;
        }

        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    return false;
  }
}
