/**
 * Client for publicly reading signed FCC action results.
 *
 * The browser never creates an FCC instruction and never holds a TEE private
 * key.  ParentVault.requestRebalance() creates the instruction on-chain; this
 * module only retrieves the corresponding result and verifies that its
 * EIP-191 signature belongs to the vault's registered TEE machine.
 */

import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  pad,
  parseAbiParameters,
  recoverMessageAddress,
  toHex,
  type Address,
} from 'viem';
import { FCE_CONFIG } from '../config/contracts';

export interface TeeActionResult {
  resultData: `0x${string}`;
  actionId: `0x${string}`;
  submissionTag: string;
  status: number;
  signature: `0x${string}`;
}

interface ActionResultResponse {
  result?: {
    id?: string;
    submissionTag?: string;
    status?: number;
    data?: string;
    log?: string;
  };
  signature?: string;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function endpoint(): string {
  const configured = FCE_CONFIG.endpoint.replace(/\/$/, '');
  if (!configured) {
    throw new Error('FCC result endpoint is not configured. Set VITE_FCE_ENDPOINT before publishing the frontend.');
  }
  return configured;
}

function resultHash(result: TeeActionResult): `0x${string}` {
  return keccak256(
    encodePacked(
      ['bytes32', 'bytes32', 'bytes32', 'uint8'],
      [
        keccak256(result.resultData),
        result.actionId,
        keccak256(toHex(new TextEncoder().encode(result.submissionTag))),
        result.status,
      ],
    ),
  );
}

function teePayloadHash(result: TeeActionResult, chainId: bigint): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32 prefix, uint256 chainId, bytes32 resultHash'),
      [
        pad(toHex('TEE_ACTION_RESULT'), { dir: 'right', size: 32 }),
        chainId,
        resultHash(result),
      ],
    ),
  );
}

/** Fetches one completed action. A 404 means the FCC stack has not finished it yet. */
export async function getTeeActionResult(instructionId: `0x${string}`): Promise<TeeActionResult | null> {
  const response = await fetch(`${endpoint()}/action/result/${instructionId}`, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`FCC result endpoint returned ${response.status}.`);
  }

  const body = await response.json() as ActionResultResponse;
  const result = body.result;
  if (!result?.id || !result.submissionTag || typeof result.status !== 'number' || !result.data || !body.signature) {
    throw new Error('FCC result endpoint returned an incomplete action result.');
  }
  if (!result.id.startsWith('0x') || !result.data.startsWith('0x') || !body.signature.startsWith('0x')) {
    throw new Error('FCC result endpoint returned malformed hex data.');
  }

  return {
    actionId: result.id as `0x${string}`,
    submissionTag: result.submissionTag,
    status: result.status,
    resultData: result.data as `0x${string}`,
    signature: body.signature as `0x${string}`,
  };
}

/**
 * Checks the exact hash domain used by ParentVault.executeRebalance().
 * This is a client-side safety check; the contract repeats the verification.
 */
export async function verifyTeeActionResult(
  result: TeeActionResult,
  expectedTeeAddress: Address,
  chainId = 114n,
): Promise<void> {
  if (result.status !== 1) {
    throw new Error(`FCC reported a failed action (status ${result.status}).`);
  }

  const recovered = await recoverMessageAddress({
    message: { raw: teePayloadHash(result, chainId) },
    signature: result.signature,
  });
  if (recovered.toLowerCase() !== expectedTeeAddress.toLowerCase()) {
    throw new Error(`FCC result signer ${recovered} does not match the vault's active TEE machine ${expectedTeeAddress}.`);
  }
}

/** Waits for a signed, on-chain instruction result and verifies it before relay. */
export async function waitForSignedRebalance(
  instructionId: `0x${string}`,
  expectedTeeAddress: Address,
  options: { attempts?: number; intervalMs?: number } = {},
): Promise<TeeActionResult> {
  const attempts = options.attempts ?? 60;
  const intervalMs = options.intervalMs ?? 2_000;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await getTeeActionResult(instructionId);
    if (result) {
      if (result.actionId.toLowerCase() !== instructionId.toLowerCase()) {
        throw new Error('FCC returned a result for a different instruction.');
      }
      await verifyTeeActionResult(result, expectedTeeAddress);
      return result;
    }
    if (attempt < attempts) await pause(intervalMs);
  }

  throw new Error('Timed out waiting for a signed FCC result. The instruction remains on-chain and can be retried safely.');
}

/** Checks that the public FCC result endpoint is reachable before a wallet request. */
export async function checkFceHealth(): Promise<boolean> {
  try {
    const configured = FCE_CONFIG.endpoint.replace(/\/$/, '');
    if (!configured) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${configured}/info`, {
      signal: controller.signal,
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
