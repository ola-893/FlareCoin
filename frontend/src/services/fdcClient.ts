import { createPublicClient, http, type Address, type Hex } from 'viem';

const COSTON2_RPC = 'https://coston2-api.flare.network/ext/C/rpc';
const VERIFIER_URL = 'https://fdc-verifiers-testnet.flare.network/verifier/xrp/XRPPayment/prepareRequest';
const DATA_AVAILABILITY_URL = 'https://ctn2-data-availability.flare.network/api/v1/fdc/proof-by-request-round';
const PUBLIC_FDC_API_KEY = '00000000-0000-0000-0000-000000000000';
const FIRST_VOTING_ROUND_TS = 1_658_430_000n;
const VOTING_ROUND_SECONDS = 90n;
const FDC_RELAY = '0xa10B672D1c62e5457b17af63d4302add6A99d7dE' as const;
const FDC_PROTOCOL_ID = 200n;

// FdcHub accepts the configured minimum, but FDC providers select requests by
// fee when a round is busy. A small premium makes a user-facing request much
// more likely to be included without introducing a trusted relayer.
export const FDC_REQUEST_FEE_MULTIPLIER = 10n;

const publicClient = createPublicClient({ transport: http(COSTON2_RPC) });

export const FDC_FEE_CONFIGURATION_ABI = [
  {
    type: 'function', name: 'getRequestFee', stateMutability: 'view',
    inputs: [{ name: '_data', type: 'bytes' }], outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const RELAY_ABI = [
  {
    type: 'function', name: 'isFinalized', stateMutability: 'view',
    inputs: [{name: 'protocolId', type: 'uint256'}, {name: 'votingRoundId', type: 'uint256'}],
    outputs: [{name: '', type: 'bool'}],
  },
] as const;

export const FDC_REQUEST_FEE_CONFIGURATION = '0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e' as const;

export type FdcXrpPaymentProof = {
  merkleProof: Hex[];
  data: {
    attestationType: Hex;
    sourceId: Hex;
    votingRound: bigint;
    lowestUsedTimestamp: bigint;
    requestBody: { transactionId: Hex; proofOwner: Address };
    responseBody: {
      blockNumber: bigint;
      blockTimestamp: bigint;
      sourceAddress: string;
      sourceAddressHash: Hex;
      receivingAddressHash: Hex;
      intendedReceivingAddressHash: Hex;
      spentAmount: bigint;
      intendedSpentAmount: bigint;
      receivedAmount: bigint;
      intendedReceivedAmount: bigint;
      hasMemoData: boolean;
      firstMemoData: Hex;
      hasDestinationTag: boolean;
      destinationTag: bigint;
      status: number;
    };
  };
};

export async function prepareXrpPaymentRequest(transactionHash: string, proofOwner: Address): Promise<Hex> {
  const normalizedHash = (`0x${transactionHash.replace(/^0x/i, '')}`).toLowerCase() as Hex;
  if (!/^0x[0-9a-f]{64}$/.test(normalizedHash)) {
    throw new Error('Enter the 64-character XRPL payment transaction hash.');
  }

  const response = await fetch(VERIFIER_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': PUBLIC_FDC_API_KEY,
    },
    body: JSON.stringify({
      attestationType: padBytes32('XRPPayment'),
      sourceId: padBytes32('testXRP'),
      requestBody: { transactionId: normalizedHash, proofOwner },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status !== 'VALID' || typeof body.abiEncodedRequest !== 'string') {
    throw new Error(body.error ?? body.message ?? 'Flare could not prepare an XRPPayment attestation request yet.');
  }
  return body.abiEncodedRequest as Hex;
}

export async function getFdcRequestFee(requestData: Hex): Promise<bigint> {
  const minimumFee = await publicClient.readContract({
    address: FDC_REQUEST_FEE_CONFIGURATION,
    abi: FDC_FEE_CONFIGURATION_ABI,
    functionName: 'getRequestFee',
    args: [requestData],
  });
  return minimumFee * FDC_REQUEST_FEE_MULTIPLIER;
}

export async function votingRoundForRequestBlock(blockNumber: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockNumber });
  if (block.timestamp < FIRST_VOTING_ROUND_TS) throw new Error('Unexpected FDC request block timestamp.');
  return (block.timestamp - FIRST_VOTING_ROUND_TS) / VOTING_ROUND_SECONDS;
}

export async function isFdcVotingRoundFinalized(votingRoundId: bigint): Promise<boolean> {
  return publicClient.readContract({
    address: FDC_RELAY,
    abi: RELAY_ABI,
    functionName: 'isFinalized',
    args: [FDC_PROTOCOL_ID, votingRoundId],
  });
}

/**
 * Returns null until the FDC voting round is finalized and the public data
 * availability service has indexed the attestation. That service responds with
 * a 400 `attestation request not found` during the normal propagation window,
 * so it must be treated as a pending result rather than a failed deposit.
 *
 * The proof remains untrusted JSON until the AssetManager verifies its Merkle
 * proof on-chain.
 */
export async function getXrpPaymentProof(requestBytes: Hex, votingRoundId: bigint): Promise<FdcXrpPaymentProof | null> {
  const response = await fetch(DATA_AVAILABILITY_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ votingRoundId: Number(votingRoundId), requestBytes }),
  });
  const body = await response.json().catch(() => ({}));
  const unavailable = typeof body.error === 'string' && body.error.toLowerCase().includes('attestation request not found');
  if (response.status === 404 || response.status === 202 || unavailable) return null;
  if (!response.ok) {
    throw new Error(body.error ?? body.message ?? `FDC proof request failed (${response.status}).`);
  }
  if (!body.response || !Array.isArray(body.proof)) return null;
  return normaliseProof(body);
}

function normaliseProof(body: any): FdcXrpPaymentProof {
  const response = body.response;
  const data = response.responseBody;
  return {
    merkleProof: body.proof as Hex[],
    data: {
      attestationType: response.attestationType as Hex,
      sourceId: response.sourceId as Hex,
      votingRound: BigInt(response.votingRound),
      lowestUsedTimestamp: BigInt(response.lowestUsedTimestamp),
      requestBody: {
        transactionId: response.requestBody.transactionId as Hex,
        proofOwner: response.requestBody.proofOwner as Address,
      },
      responseBody: {
        blockNumber: BigInt(data.blockNumber),
        blockTimestamp: BigInt(data.blockTimestamp),
        sourceAddress: data.sourceAddress,
        sourceAddressHash: data.sourceAddressHash as Hex,
        receivingAddressHash: data.receivingAddressHash as Hex,
        intendedReceivingAddressHash: data.intendedReceivingAddressHash as Hex,
        spentAmount: BigInt(data.spentAmount),
        intendedSpentAmount: BigInt(data.intendedSpentAmount),
        receivedAmount: BigInt(data.receivedAmount),
        intendedReceivedAmount: BigInt(data.intendedReceivedAmount),
        hasMemoData: Boolean(data.hasMemoData),
        firstMemoData: data.firstMemoData as Hex,
        hasDestinationTag: Boolean(data.hasDestinationTag),
        destinationTag: BigInt(data.destinationTag),
        status: Number(data.status),
      },
    },
  };
}

function padBytes32(value: string): Hex {
  const hex = Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex.padEnd(64, '0')}` as Hex;
}
