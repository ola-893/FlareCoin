#!/usr/bin/env node

/**
 * Deploys the current ParentVault implementation and upgrades only the Coston2
 * FXRP vault proxy. The script verifies the owner and all configuration fields
 * that must survive the UUPS upgrade before reporting success.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const RPC_URL = process.env.COSTON2_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const VAULT = process.env.PARENT_VAULT_ADDRESS || '0x01f64160E4928Eba5607aE294F9B66090Dc323B3';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

const vaultAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'fAssetAdapter', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'activeStrategy', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'teeAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'instructionSender', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'rebalanceThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'rebalanceNonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'upgradeToAndCall', stateMutability: 'payable', inputs: [{ type: 'address' }, { type: 'bytes' }], outputs: [] },
];

function implementationFromSlot(value) {
  return `0x${value.slice(-40)}`;
}

async function snapshot(client) {
  const [owner, asset, fAssetAdapter, activeStrategy, teeAddress, instructionSender, rebalanceThreshold, rebalanceNonce, implementationSlot] = await Promise.all([
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'owner' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'asset' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'fAssetAdapter' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'activeStrategy' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'teeAddress' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'instructionSender' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'rebalanceThreshold' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'rebalanceNonce' }),
    client.getStorageAt({ address: VAULT, slot: IMPLEMENTATION_SLOT }),
  ]);
  return { owner, asset, fAssetAdapter, activeStrategy, teeAddress, instructionSender, rebalanceThreshold, rebalanceNonce, implementation: implementationFromSlot(implementationSlot) };
}

function sameConfiguration(before, after) {
  for (const key of ['owner', 'asset', 'fAssetAdapter', 'activeStrategy', 'teeAddress', 'instructionSender', 'rebalanceThreshold', 'rebalanceNonce']) {
    if (String(before[key]).toLowerCase() !== String(after[key]).toLowerCase()) {
      throw new Error(`UUPS upgrade changed ${key}: ${before[key]} -> ${after[key]}`);
    }
  }
}

async function main() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY is required for the owner-authorized UUPS upgrade.');

  const artifact = JSON.parse(readFileSync(resolve(process.cwd(), 'out/ParentVault.sol/ParentVault.json')));
  const bytecode = artifact.bytecode?.object;
  if (!bytecode?.startsWith('0x')) throw new Error('ParentVault artifact does not contain deployable bytecode. Run forge build first.');

  const account = privateKeyToAccount(PRIVATE_KEY);
  const client = createPublicClient({ transport: http(RPC_URL) });
  const wallet = createWalletClient({ account, transport: http(RPC_URL) });
  const chainId = await client.getChainId();
  if (chainId !== 114) throw new Error(`Connected to chain ${chainId}, expected Coston2 (114).`);

  const before = await snapshot(client);
  if (before.owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Configured signer ${account.address} is not the FXRP vault owner ${before.owner}.`);
  }
  console.log(`Current implementation: ${before.implementation}`);

  const deployHash = await wallet.deployContract({ abi: artifact.abi, bytecode });
  const deployReceipt = await client.waitForTransactionReceipt({ hash: deployHash });
  if (deployReceipt.status !== 'success' || !deployReceipt.contractAddress) throw new Error(`ParentVault implementation deployment failed: ${deployHash}`);
  const implementation = deployReceipt.contractAddress;
  if (!(await client.getBytecode({ address: implementation }))) throw new Error(`No bytecode found at new implementation ${implementation}.`);

  const upgradeHash = await wallet.writeContract({
    account,
    address: VAULT,
    abi: vaultAbi,
    functionName: 'upgradeToAndCall',
    args: [implementation, '0x'],
  });
  const upgradeReceipt = await client.waitForTransactionReceipt({ hash: upgradeHash });
  if (upgradeReceipt.status !== 'success') throw new Error(`FXRP vault upgrade reverted: ${upgradeHash}`);

  const after = await snapshot(client);
  sameConfiguration(before, after);
  if (after.implementation.toLowerCase() !== implementation.toLowerCase()) {
    throw new Error(`Implementation slot is ${after.implementation}; expected ${implementation}.`);
  }

  console.log('✓ FXRP vault upgrade verified');
  console.log(`  implementation: ${implementation}`);
  console.log(`  deploy tx:      ${deployHash}`);
  console.log(`  upgrade tx:     ${upgradeHash}`);
  console.log(`  explorer:       https://coston2-explorer.flare.network/tx/${upgradeHash}`);
}

main().catch((error) => {
  console.error(`✗ FXRP vault upgrade failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
