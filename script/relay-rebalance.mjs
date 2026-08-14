#!/usr/bin/env node

/**
 * Relays one completed, TEE-signed FCC rebalance result to ParentVault.
 * The result signature, signer, nonce, and strategy approval are checked again
 * before this permissionless on-chain call is submitted.
 *
 * Usage: node script/relay-rebalance.mjs <instruction-id>
 */

import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  encodeAbiParameters,
  encodePacked,
  http,
  keccak256,
  pad,
  parseAbiParameters,
  recoverMessageAddress,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const RPC_URL = process.env.COSTON2_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const VAULT = process.env.PARENT_VAULT_ADDRESS || '0x01f64160E4928Eba5607aE294F9B66090Dc323B3';
const FCE_PROXY_URL = (process.env.FCE_PROXY_URL || process.env.VITE_FCE_ENDPOINT || 'https://trolling-affluent-parcel.ngrok-free.dev').replace(/\/$/, '');

const vaultAbi = [
  { type: 'function', name: 'teeAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'rebalanceNonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approvedStrategies', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function', name: 'executeRebalance', stateMutability: 'nonpayable',
    inputs: [
      { type: 'bytes' }, { type: 'bytes32' }, { type: 'string' }, { type: 'uint8' }, { type: 'bytes' },
    ], outputs: [],
  },
];

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function actionPayloadHash(result, chainId) {
  const resultHash = keccak256(encodePacked(
    ['bytes32', 'bytes32', 'bytes32', 'uint8'],
    [
      keccak256(result.resultData),
      result.actionId,
      keccak256(toHex(new TextEncoder().encode(result.submissionTag))),
      result.status,
    ],
  ));
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32 prefix, uint256 chainId, bytes32 resultHash'),
    [pad(toHex('TEE_ACTION_RESULT'), { dir: 'right', size: 32 }), chainId, resultHash],
  ));
}

async function main() {
  const instructionId = process.argv[2];
  assertion(/^0x[0-9a-fA-F]{64}$/.test(instructionId || ''), 'Usage: node script/relay-rebalance.mjs <bytes32 instruction-id>');
  assertion(PRIVATE_KEY, 'PRIVATE_KEY is required to submit the relay transaction.');

  const account = privateKeyToAccount(PRIVATE_KEY);
  const client = createPublicClient({ transport: http(RPC_URL) });
  const wallet = createWalletClient({ account, transport: http(RPC_URL) });
  const chainId = await client.getChainId();
  assertion(chainId === 114, `Connected to chain ${chainId}, expected Coston2 (114).`);

  const response = await fetch(`${FCE_PROXY_URL}/action/result/${instructionId}`);
  assertion(response.ok, `No completed FCC result for ${instructionId} (HTTP ${response.status}).`);
  const body = await response.json();
  const result = body.result;
  assertion(result?.id === instructionId && result?.status === 1, 'FCC result is not a successful result for this instruction.');
  assertion(typeof result?.data === 'string' && typeof result?.submissionTag === 'string' && typeof body?.signature === 'string', 'FCC result is missing signed action fields.');

  const action = {
    actionId: result.id,
    submissionTag: result.submissionTag,
    status: result.status,
    resultData: result.data,
  };
  const teeAddress = await client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'teeAddress' });
  const recovered = await recoverMessageAddress({ message: { raw: actionPayloadHash(action, BigInt(chainId)) }, signature: body.signature });
  assertion(recovered.toLowerCase() === teeAddress.toLowerCase(), `Result signer ${recovered} does not match vault TEE ${teeAddress}.`);

  const [newStrategy, , nonce] = decodeAbiParameters(
    parseAbiParameters('address newStrategy,uint256 minAmountOut,uint256 nonce,uint256 deadline,uint256 twapStart,uint256 twapEnd,bytes32 strategyDataHash'),
    result.data,
  );
  const [expectedNonce, approved] = await Promise.all([
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'rebalanceNonce' }),
    client.readContract({ address: VAULT, abi: vaultAbi, functionName: 'approvedStrategies', args: [newStrategy] }),
  ]);
  assertion(nonce === expectedNonce, `Result nonce ${nonce} does not match vault nonce ${expectedNonce}.`);
  assertion(approved, `Result selected an unapproved strategy ${newStrategy}.`);

  const hash = await wallet.writeContract({
    account,
    address: VAULT,
    abi: vaultAbi,
    functionName: 'executeRebalance',
    args: [result.data, result.id, result.submissionTag, result.status, body.signature],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assertion(receipt.status === 'success', `executeRebalance reverted: ${hash}`);

  console.log('✓ TEE-signed rebalance relayed successfully');
  console.log(`  instruction: ${instructionId}`);
  console.log(`  signer:      ${recovered}`);
  console.log(`  strategy:    ${newStrategy}`);
  console.log(`  tx:          ${hash}`);
  console.log(`  explorer:    https://coston2-explorer.flare.network/tx/${hash}`);
}

main().catch((error) => {
  console.error(`✗ Rebalance relay failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
