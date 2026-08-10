#!/usr/bin/env node

/**
 * script/trigger-rebalance.mjs
 *
 * CLI utility to trigger requestRebalance() on ParentVault with up to 20 retries.
 * Handles RPC timeouts and ngrok tunnel packet drops seamlessly.
 *
 * Usage:
 *   node script/trigger-rebalance.mjs
 *   npm run rebalance:retry
 */

import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const COSTON2_RPC_URL = process.env.COSTON2_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xce44c9cf317f66b5e3ea12ee1c92bb77a6dd2d02265b086eba66f8f338d5d7dc';
const PARENT_VAULT_ADDRESS = process.env.PARENT_VAULT_ADDRESS || '0x01f64160E4928Eba5607aE294F9B66090Dc323B3';
const MAX_RETRIES = 20;

const coston2 = {
  id: 114,
  name: 'Flare Coston2',
  nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
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
    type: 'function', name: 'instructionSender', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'teeAddress', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'requestRebalance', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
];

const ERC20_ABI = [
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     FlareYield Rebalance Trigger — 20 Retry Resilience      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`[Rebalance] Caller Address : ${account.address}`);
  console.log(`[Rebalance] ParentVault    : ${PARENT_VAULT_ADDRESS}`);
  console.log(`[Rebalance] Coston2 RPC    : ${COSTON2_RPC_URL}\n`);

  const publicClient = createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL) });
  const walletClient = createWalletClient({ chain: coston2, transport: http(COSTON2_RPC_URL), account });

  // 1. Read vault status
  const [threshold, assetAddr, senderAddr, teeAddr] = await Promise.all([
    publicClient.readContract({ address: PARENT_VAULT_ADDRESS, abi: PARENT_VAULT_ABI, functionName: 'rebalanceThreshold' }),
    publicClient.readContract({ address: PARENT_VAULT_ADDRESS, abi: PARENT_VAULT_ABI, functionName: 'asset' }),
    publicClient.readContract({ address: PARENT_VAULT_ADDRESS, abi: PARENT_VAULT_ABI, functionName: 'instructionSender' }),
    publicClient.readContract({ address: PARENT_VAULT_ADDRESS, abi: PARENT_VAULT_ABI, functionName: 'teeAddress' }),
  ]);

  const idleAssets = await publicClient.readContract({
    address: assetAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [PARENT_VAULT_ADDRESS],
  });

  console.log(`[Status] Idle Assets        : ${formatUnits(idleAssets, 18)} FXRP`);
  console.log(`[Status] Rebalance Threshold: ${formatUnits(threshold, 18)} FXRP`);
  console.log(`[Status] InstructionSender : ${senderAddr}`);
  console.log(`[Status] TEE Machine       : ${teeAddr}\n`);

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Rebalance] ⏳ Requesting rebalance on-chain (attempt ${attempt}/${MAX_RETRIES})...`);
      const hash = await walletClient.writeContract({
        chain: coston2,
        account,
        address: PARENT_VAULT_ADDRESS,
        abi: PARENT_VAULT_ABI,
        functionName: 'requestRebalance',
      });

      console.log(`[Rebalance] Tx submitted: ${hash} — awaiting confirmation...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log(`\n🎉 SUCCESS! requestRebalance() confirmed in block ${receipt.blockNumber}! (Attempt ${attempt})`);
        console.log(`   Tx Hash: ${hash}`);
        console.log(`   Explorer: https://coston2-explorer.flare.network/tx/${hash}\n`);
        return;
      } else {
        throw new Error(`Transaction reverted: ${hash}`);
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Rebalance] ⚠️ Attempt ${attempt}/${MAX_RETRIES} failed: ${err.shortMessage || err.message || err}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  console.error(`\n❌ Failed to execute requestRebalance after ${MAX_RETRIES} attempts:`, lastError);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
