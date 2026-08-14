#!/usr/bin/env node

/**
 * Read-only release gate for the public Coston2 FCC rebalance flow.
 *
 * Usage:
 *   node script/preflight-release.mjs
 *   FCE_PROXY_URL=https://your-public-proxy node script/preflight-release.mjs
 *   node script/preflight-release.mjs --instruction 0x... # also verifies one result signature
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {
  createPublicClient,
  encodeAbiParameters,
  encodePacked,
  http,
  keccak256,
  pad,
  parseAbiParameters,
  recoverMessageAddress,
  toHex,
} from 'viem';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const COSTON2_RPC_URL = process.env.COSTON2_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc';
const PARENT_VAULT = process.env.PARENT_VAULT_ADDRESS || '0x01f64160E4928Eba5607aE294F9B66090Dc323B3';
const INSTRUCTION_SENDER = process.env.INSTRUCTION_SENDER_ADDRESS || '0x94A838fb58B226b0EB01Fa8DdE3758806AcE1Ba7';
const FLARE_TEE_MANAGER = process.env.FLARE_TEE_MANAGER_ADDRESS || '0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE';
const EXTENSION_ID = BigInt(process.env.FCE_EXTENSION_ID || loadExtensionId() || '66166');
const FCE_PROXY_URL = (process.env.FCE_PROXY_URL || process.env.VITE_FCE_ENDPOINT || 'https://trolling-affluent-parcel.ngrok-free.dev').replace(/\/$/, '');

const vaultAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'teeAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'instructionSender', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'rebalanceThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] ;

const instructionSenderAbi = [
  { type: 'function', name: 'extensionId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] ;

const registryAbi = [
  { type: 'function', name: 'getTeeExtensionInstructionsSender', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getActiveTeeMachines', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address[]' }, { type: 'string[]' }] },
  { type: 'function', name: 'getTeeMachineStatus', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint8' }] },
  {
    type: 'function', name: 'getPublicKey', stateMutability: 'view', inputs: [{ type: 'address' }],
    outputs: [{ type: 'tuple', components: [{ name: 'x', type: 'bytes32' }, { name: 'y', type: 'bytes32' }] }],
  },
] ;

function loadExtensionId() {
  try {
    const config = dotenv.parse(readFileSync(resolve(process.cwd(), 'fce-extension-scaffold/config/extension.env')));
    return config.EXTENSION_ID;
  } catch {
    return undefined;
  }
}

function assertion(condition, message) {
  if (!condition) throw new Error(message);
}

function short(value) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
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

function findPublicKey(payload) {
  const candidates = [
    payload?.publicKey,
    payload?.teeInfo?.publicKey,
    payload?.machineData?.publicKey,
    payload?.result?.teeInfo?.publicKey,
    payload?.result?.machineData?.publicKey,
  ];
  return candidates.find((key) => typeof key?.x === 'string' && typeof key?.y === 'string');
}

async function verifyInstructionResult(instructionId, expectedSigner, chainId) {
  const response = await fetch(`${FCE_PROXY_URL}/action/result/${instructionId}`);
  assertion(response.ok, `No completed action result available for ${instructionId} (HTTP ${response.status}).`);
  const body = await response.json();
  const result = body.result;
  assertion(result?.id === instructionId, 'Result ID does not match the requested instruction.');
  assertion(result?.status === 1, `FCC result status is ${result?.status}; expected success (1).`);
  assertion(typeof result?.data === 'string' && typeof result?.submissionTag === 'string' && typeof body?.signature === 'string', 'Result is missing signed action fields.');

  const recovered = await recoverMessageAddress({
    message: { raw: actionPayloadHash({
      actionId: result.id,
      submissionTag: result.submissionTag,
      status: result.status,
      resultData: result.data,
    }, chainId) },
    signature: body.signature,
  });
  assertion(recovered.toLowerCase() === expectedSigner.toLowerCase(), `Result signer ${recovered} does not match active TEE ${expectedSigner}.`);
  return recovered;
}

async function main() {
  const instructionFlag = process.argv.indexOf('--instruction');
  const instructionId = instructionFlag >= 0 ? process.argv[instructionFlag + 1] : undefined;
  if (instructionFlag >= 0) assertion(instructionId?.startsWith('0x'), '--instruction requires a bytes32 instruction ID.');

  const client = createPublicClient({ transport: http(COSTON2_RPC_URL) });
  const chainId = await client.getChainId();
  assertion(chainId === 114, `RPC is chain ${chainId}, expected Coston2 (114).`);
  assertion(await client.getBytecode({ address: PARENT_VAULT }) !== undefined, 'ParentVault has no deployed code.');

  const [owner, asset, paused, teeAddress, instructionSender, threshold, senderExtensionId, registeredSender, active] = await Promise.all([
    client.readContract({ address: PARENT_VAULT, abi: vaultAbi, functionName: 'owner' }),
    client.readContract({ address: PARENT_VAULT, abi: vaultAbi, functionName: 'asset' }),
    client.readContract({ address: PARENT_VAULT, abi: vaultAbi, functionName: 'paused' }),
    client.readContract({ address: PARENT_VAULT, abi: vaultAbi, functionName: 'teeAddress' }),
    client.readContract({ address: PARENT_VAULT, abi: vaultAbi, functionName: 'instructionSender' }),
    client.readContract({ address: PARENT_VAULT, abi: vaultAbi, functionName: 'rebalanceThreshold' }),
    client.readContract({ address: INSTRUCTION_SENDER, abi: instructionSenderAbi, functionName: 'extensionId' }),
    client.readContract({ address: FLARE_TEE_MANAGER, abi: registryAbi, functionName: 'getTeeExtensionInstructionsSender', args: [EXTENSION_ID] }),
    client.readContract({ address: FLARE_TEE_MANAGER, abi: registryAbi, functionName: 'getActiveTeeMachines', args: [EXTENSION_ID] }),
  ]);

  const [activeTeeIds, activeUrls] = active;
  assertion(!paused, 'ParentVault is paused.');
  assertion(threshold > 0n, 'rebalanceThreshold is zero; automated requests are intentionally disabled.');
  assertion(instructionSender.toLowerCase() === INSTRUCTION_SENDER.toLowerCase(), `Vault sender ${instructionSender} differs from release sender ${INSTRUCTION_SENDER}.`);
  assertion(senderExtensionId === EXTENSION_ID, `InstructionSender extension ${senderExtensionId} differs from release extension ${EXTENSION_ID}.`);
  assertion(registeredSender.toLowerCase() === INSTRUCTION_SENDER.toLowerCase(), `Registry sender ${registeredSender} differs from release sender ${INSTRUCTION_SENDER}.`);
  assertion(activeTeeIds.length === 1 && activeUrls.length === 1, `Expected exactly one active TEE for extension ${EXTENSION_ID}; found ${activeTeeIds.length}.`);
  assertion(teeAddress.toLowerCase() === activeTeeIds[0].toLowerCase(), `Vault teeAddress ${teeAddress} does not match active TEE ${activeTeeIds[0]}.`);

  const teeStatus = await client.readContract({ address: FLARE_TEE_MANAGER, abi: registryAbi, functionName: 'getTeeMachineStatus', args: [activeTeeIds[0]] });
  assertion(teeStatus === 2, `Active TEE has status ${teeStatus}; expected production status 2.`);
  const registeredPublicKey = await client.readContract({ address: FLARE_TEE_MANAGER, abi: registryAbi, functionName: 'getPublicKey', args: [activeTeeIds[0]] });

  const proxyResponse = await fetch(`${FCE_PROXY_URL}/info`);
  assertion(proxyResponse.ok, `FCC proxy /info returned HTTP ${proxyResponse.status}.`);
  const proxyInfo = await proxyResponse.json();
  const publicKey = findPublicKey(proxyInfo);
  assertion(publicKey, 'FCC proxy /info did not include a TEE public key.');
  assertion(
    publicKey.x.toLowerCase() === registeredPublicKey.x.toLowerCase()
      && publicKey.y.toLowerCase() === registeredPublicKey.y.toLowerCase(),
    `Proxy /info public key does not match the active TEE ${activeTeeIds[0]} in FlareTeeManager.`,
  );

  console.log('✓ Coston2 release preflight passed');
  console.log(`  vault:       ${PARENT_VAULT}`);
  console.log(`  owner:       ${owner}`);
  console.log(`  asset:       ${asset}`);
  console.log(`  sender:      ${instructionSender}`);
  console.log(`  extension:   ${EXTENSION_ID}`);
  console.log(`  active TEE:  ${activeTeeIds[0]} (${activeUrls[0]})`);
  console.log(`  proxy key:   ${short(publicKey.x)}`);
  console.log(`  threshold:   ${threshold.toString()} base units`);

  if (instructionId) {
    const signer = await verifyInstructionResult(instructionId, activeTeeIds[0], BigInt(chainId));
    console.log(`  result:      ${instructionId} signed by ${signer}`);
  }
}

main().catch((error) => {
  console.error(`✗ Coston2 release preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
