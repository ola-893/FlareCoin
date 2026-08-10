# FlareYield FCE Extension

Flare Confidential Extension for autonomous vault rebalancing with confidential APY calculation.

## Overview

This FCE extension runs inside a TEE enclave and provides:

1. **Confidential APY Calculation** - Calculates strategy yields inside hardware-encrypted memory
2. **Optimal Strategy Selection** - Selects best risk-adjusted returns
3. **Automated Rebalance Signing** - Signs EIP-712 payloads with TEE-attested key
4. **24/7 Autonomous Operation** - Monitors vault state and rebalances automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TEE Enclave Container                    │
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │  Extension App   │  POST   │      tee-node           │  │
│  │  (TypeScript)    │ ─────>  │  (Signs & Dispatches)   │  │
│  │  :$EXT_PORT      │ /decrypt│  :$SIGN_PORT            │  │
│  └──────────────────┘         └─────────────────────────┘  │
└───────────────────────────────────┬─────────────────────────┘
                                    │ POST /action
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│              On-Chain Smart Contracts                       │
│                                                             │
│  • InstructionSender.sol (emits rebalance requests)        │
│  • TeeExtensionRegistry.sol (validates attestations)       │
│  • ParentVault.sol (executes signed rebalances)            │
└─────────────────────────────────────────────────────────────┘
```

## Operation Types

### `VAULT_REBALANCE` Operations

**CALCULATE_OPTIMAL**
- Input: Vault state (idle assets, approved strategies)
- Output: Signed rebalance payload with optimal strategy
- Confidential: APY calculations happen inside TEE

### `STRATEGY_ANALYSIS` Operations

**GET_APYS**
- Input: Array of strategy addresses
- Output: APY estimates with confidence scores
- Confidential: Yield calculations protected from MEV

## Handlers

### `handleCalculateOptimal`

Processes rebalance requests from ParentVault:

1. **Decode Request** - Extract vault state from instruction payload
2. **Validate** - Check idle assets meet minimum threshold
3. **Calculate APYs** - Query strategy values confidentially
4. **Select Optimal** - Choose best risk-adjusted return
5. **Build Payload** - Create EIP-712 rebalance structure
6. **Return** - tee-node signs and submits on-chain

**Request Format:**
```typescript
interface RebalanceRequest {
  vaultAddress: `0x${string}`;
  idleAssets: bigint;
  approvedStrategies: `0x${string}`[];
  liquidityBufferBps: number;
}
```

**Response Format:**
```typescript
{
  payload: `0x${string}`;           // Encoded rebalance payload
  optimalStrategy: `0x${string}`;   // Selected strategy address
  estimatedAPY: number;             // Expected yield
  deployAmount: string;             // Amount to deploy
  minAmountOut: string;             // Slippage protection
}
```

### `handleGetAPYs`

Returns current APY estimates for requested strategies.

**Request Format:**
```json
["0xc529Eb4a03EC14E58598D03058DBb43B75059851", "0xA88327A42267C0dE171CBECA1b016dEF2e990612"]
```

**Response Format (ABI-encoded):**
```solidity
struct StrategyAPY {
    address strategyAddress;
    uint256 estimatedAPY;  // Basis points (e.g., 550 = 5.5%)
    uint256 confidence;    // Basis points (e.g., 90 = 0.9)
    uint256 lastUpdate;    // Unix timestamp
}
```

## Configuration

Edit `src/app/config.ts`:

```typescript
// Network
export const COSTON2_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";

// Contracts
export const PARENT_VAULT_FXRP = "0x01f64160E4928Eba5607aE294F9B66090Dc323B3";
export const PARENT_VAULT_CDP = "0x71cF7B0f792400a2533e917bcfB3892b34b569e8";

// Strategies
export const FTSO_ADAPTER = "0xc529Eb4a03EC14E58598D03058DBb43B75059851";
export const SPARKDEX_ADAPTER = "0xA88327A42267C0dE171CBECA1b016dEF2e990612";
export const ENOSYS_CDP_ADAPTER = "0x276BBc877C3d50e50848E7ca8c68241D959F4800";

// Thresholds
// FXRP is a 6-decimal token — amounts are sent/received in 6-decimal scale.
export const MIN_REBALANCE_AMOUNT = BigInt(1_000_000); // 1 FXRP (6 decimals)
export const SLIPPAGE_TOLERANCE_BPS = 50; // 0.5%
```

## Development

### Install Dependencies

```bash
npm install
```

### Run Tests

```bash
npm test
```

### Build Docker Image

```bash
docker build -t flareyield-rebalance:v1 .
```

### Run Locally (Testing)

```bash
# Start the extension server
npm start

# In another terminal, test with curl
curl -X POST http://localhost:8080/action \
  -H "Content-Type: application/json" \
  -d '{
    "instructionId": "1",
    "opType": "0x...",
    "opCommand": "0x...",
    "message": "0x..."
  }'
```

## Deployment

### 1. Build and Attest

```bash
# Generate hardware attestation
./scripts/pre-build.sh

# Build TEE container
docker build -t flareyield-rebalance:v1 .

# Get image hash for registration
docker images --no-trunc --quiet flareyield-rebalance:v1
```

### 2. Register Extension

```bash
# Register on TeeExtensionRegistry
cast send $TEE_EXTENSION_REGISTRY \
  "registerExtension(bytes32,bytes32,address)" \
  $(cast keccak "flareyield-rebalance-v1") \
  $IMAGE_HASH \
  $TEE_SIGNER_ADDRESS \
  --private-key $DEPLOYER_KEY \
  --rpc-url $COSTON2_RPC_URL
```

### 3. Update ParentVault

```bash
# Set fccSigner to TEE key
cast send $PARENT_VAULT_ADDRESS \
  "setFccSigner(address)" \
  $TEE_SIGNER_ADDRESS \
  --private-key $OWNER_KEY \
  --rpc-url $COSTON2_RPC_URL
```

### 4. Deploy to GCP Confidential Space

```bash
# Deploy container to GCP
gcloud run deploy flareyield-rebalance \
  --image gcr.io/$PROJECT_ID/flareyield-rebalance:v1 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="COSTON2_RPC_URL=$RPC_URL"
```

## Security

### APY Calculation Inside TEE

All yield calculations happen inside the hardware-encrypted TEE memory:

```typescript
function calculateStrategyAPYs(strategies: `0x${string}`[]): StrategyAPY[] {
  // This code runs inside SGX/SEV enclave
  // APY data never leaves encrypted memory
  // MEV bots cannot front-run based on our analysis
  
  for (const strategy of strategies) {
    const totalValue = await readContract(strategy, "totalValue");
    const estimatedAPY = analyzeYield(totalValue); // Confidential
    // ...
  }
}
```

### Signature Protection

The TEE key never leaves the enclave:

```typescript
// Extension returns unsigned payload
const payload = buildRebalancePayload(optimalStrategy);

// tee-node signs with attested key INSIDE enclave
const signature = await teeNode.sign(payload);

// Signed transaction submitted on-chain
await submitTransaction(payload, signature);
```

### TWAP Protection

Always uses 24-hour TWAP windows:

```typescript
const twapEnd = now;
const twapStart = now - MIN_TWAP_WINDOW; // 24 hours

// Contract validates this on-chain
if (twapEnd - twapStart < 24 hours) revert InvalidTwapWindow();
```

## Monitoring

### Check Extension State

```bash
curl http://localhost:8080/state
```

**Response:**
```json
{
  "lastRebalanceTime": 1707000000,
  "totalRebalances": 42,
  "lastOptimalStrategy": "0xc529Eb4a03EC14E58598D03058DBb43B75059851",
  "cachedAPYsCount": 3,
  "cachedAPYs": [
    {
      "address": "0xc529Eb4a03EC14E58598D03058DBb43B75059851",
      "apy": 5.5,
      "confidence": 0.9,
      "lastUpdate": 1707000000
    }
  ]
}
```

### Check Logs

```bash
# Local development
docker logs flareyield-rebalance

# GCP deployment
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=flareyield-rebalance"
```

## Integration with ParentVault

### 1. Add InstructionSender Integration

Update `ParentVault.sol`:

```solidity
import {IInstructionSender} from "@flare/fcc/IInstructionSender.sol";

contract ParentVault is ERC4626Upgradeable {
    IInstructionSender public instructionSender;
    
    function requestRebalance() external {
        uint256 idleAssets = IERC20(asset()).balanceOf(address(this));
        
        if (idleAssets < rebalanceThreshold) revert InsufficientAssets();
        
        bytes memory payload = abi.encode(
            address(this),
            idleAssets,
            getApprovedStrategies(),
            liquidityBufferBps
        );
        
        instructionSender.sendInstructions(
            instructionId++,
            keccak256("VAULT_REBALANCE"),
            keccak256("CALCULATE_OPTIMAL"),
            payload
        );
    }
}
```

### 2. Automatic Triggering

The extension monitors vault deposits and automatically triggers rebalances:

```typescript
// Inside TEE, runs every 60 seconds
async function monitorVaults() {
  for (const vault of [PARENT_VAULT_FXRP, PARENT_VAULT_CDP]) {
    const idleAssets = await vault.totalAssets();
    const activeStrategy = await vault.activeStrategy();
    
    if (idleAssets > MIN_REBALANCE_AMOUNT && !activeStrategy) {
      // Trigger rebalance
      await handleCalculateOptimal(encodeRequest(vault, idleAssets));
    }
  }
}
```

## Troubleshooting

### Extension Not Responding

```bash
# Check if container is running
docker ps | grep flareyield-rebalance

# Check logs
docker logs flareyield-rebalance --tail 100

# Restart extension
docker restart flareyield-rebalance
```

### Signature Verification Failing

```bash
# Verify fccSigner matches TEE key
cast call $PARENT_VAULT_ADDRESS "fccSigner()(address)" --rpc-url $RPC_URL

# Check extension registration
cast call $TEE_EXTENSION_REGISTRY \
  "isExtensionRegistered(bytes32)(bool)" \
  $(cast keccak "flareyield-rebalance-v1") \
  --rpc-url $RPC_URL
```

### APY Calculation Issues

Check RPC connectivity:

```bash
# Test RPC
curl -X POST $COSTON2_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## License

MIT

