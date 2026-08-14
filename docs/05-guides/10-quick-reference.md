# FAsset Settlement Fix - Quick Reference Card

## 🎯 What Was Fixed

**Problem**: Users clicking "Settle" too early → `UnknownDirectMint` revert → "Interaction failed"

**Solution**: Poll `pendingDirectMints(depositId)` every 3s until executor processes deposit on-chain

## 📝 Key Changes

### Frontend (Deposit.tsx)

#### 1. Added Polling Hook
```typescript
const {data: pendingDirectMint, isLoading: isPendingDirectMintLoading} = useReadContract({
  address: CONTRACTS.fAssetAdapter,
  abi: FASSET_ADAPTER_ABI,
  functionName: 'pendingDirectMints',
  args: depositId ? [depositId as `0x${string}`] : undefined,
  query: {
    enabled: step === 'READY_TO_SETTLE' && !!depositId,
    refetchInterval: 3000, // Poll every 3 seconds
  },
});
```

#### 2. Added On-Chain Check
```typescript
const isDepositProcessedOnChain = pendingDirectMint 
  ? (pendingDirectMint as any)[0] !== '0x0000000000000000000000000000000000000000' 
    && (pendingDirectMint as any)[2] > 0n
  : false;
```

#### 3. Added Error Decoding
```typescript
if (errorMsg.includes('UnknownDirectMint')) {
  setSettlementErrorMessage('Deposit has not been processed on-chain yet...');
} else if (errorMsg.includes('InsufficientFAssetBalance')) {
  setSettlementErrorMessage('Adapter has not received FXRP tokens yet.');
}
// ... etc
```

#### 4. Updated Component Props
```typescript
<StepReadyToSettle
  isDepositProcessedOnChain={isDepositProcessedOnChain}
  isPendingDirectMintLoading={isPendingDirectMintLoading}
  settlementError={settlementErrorMessage}
  // ... other props
/>
```

### Executor (No Changes Needed) ✅
Already correctly implements:
- Tag validation
- FXRP provisioning
- `processDirectMint()` call
- Transaction confirmation

## 🔗 Contract Interactions

### pendingDirectMints Struct
```solidity
struct PendingDirectMint {
    address receiver;  // [0] User address
    uint256 tag;       // [1] Minting tag
    uint256 assets;    // [2] FXRP amount (6 decimals)
}
```

### States
| State | receiver | assets | Button |
|-------|----------|--------|--------|
| **Not Processed** | address(0) | 0 | 🔴 DISABLED |
| **Processed** | 0x0b0692... | 234000 | 🟢 ENABLED |

## 🎨 UI States

### Before Processing (Amber)
```
🟡 Awaiting Executor Processing...
🕐 Clock icon (pulsing)
⚠️  "Waiting for on-chain confirmation..."
🔘 Button: "Awaiting Executor..." (DISABLED)
```

### After Processing (Green)
```
🟢 FAssets received!
✅ Checkmark icon
💚 Ready to settle
🔵 Button: "Settle & Receive Shares" (ENABLED)
```

## 📊 Timing

```
XRPL Payment → Executor Detects (0-15s) → processDirectMint (5s) 
    → Frontend Polls (0-3s) → Button Enabled ✅
```

**Total Wait**: 5-23 seconds from XRPL payment to button enabled

## 🧪 Quick Test

### Test 1: Normal Flow ✅
```bash
1. Reserve tag → 2. Send XRPL → 3. Wait for amber → 4. Wait for green → 5. Settle
Expected: Success, shares minted
```

### Test 2: Early Settlement ⚠️
```bash
1. Reserve tag → 2. Send XRPL → 3. Try to click button
Expected: Button disabled, cannot click
```

## 🔍 Debugging

### Check On-Chain State
```javascript
// Browser console:
await readContract({
  address: '0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7',
  abi: FASSET_ADAPTER_ABI,
  functionName: 'pendingDirectMints',
  args: ['0x79675cd6...0dc6ae'] // Your depositId
});
// Returns: [receiver, tag, assets]
```

### Check Executor Logs
```bash
# Terminal where executor is running:
[Flare][Tag 12345] ✅ processDirectMint confirmed in block 12346!
```

### Check Browser Network Tab
```
POST https://coston2-api.flare.network/ext/C/rpc
Method: eth_call
To: 0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7
Data: pendingDirectMints(bytes32)
```

## 🚨 Error Messages

| Error Code | User Message |
|------------|--------------|
| `UnknownDirectMint` | "Deposit not processed yet. Please wait..." |
| `InsufficientFAssetBalance` | "Adapter hasn't received FXRP yet." |
| `UnknownPendingDeposit` | "Vault deposit queue pending." |

## 📦 Files Changed

```
frontend/src/pages/Deposit.tsx
├── Added: pendingDirectMint polling
├── Added: isDepositProcessedOnChain check
├── Added: settlementErrorMessage state
├── Updated: StepReadyToSettle component
└── Updated: handleSettle validation

executor/ (No changes needed ✅)
```

## 🎯 Success Criteria

- [x] Button disabled until assets > 0
- [x] Polling every 3 seconds
- [x] UI transitions amber → green
- [x] Error messages decoded
- [x] Settlement succeeds
- [x] No "Interaction failed"

## 🔧 Addresses (Coston2 Testnet)

| Contract | Address |
|----------|---------|
| FAssetAdapter | `0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7` |
| ParentVault (FXRP) | `0x01f64160E4928Eba5607aE294F9B66090Dc323B3` |
| FXRP Token | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| Asset Manager | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` |

## 🌐 Links

- **Coston2 Explorer**: https://coston2-explorer.flare.network
- **Coston2 Faucet**: https://faucet.flare.network/coston2
- **XRPL Testnet**: https://testnet.xrpl.org

## ⚡ Deploy Commands

### Frontend
```bash
cd frontend
npm install
npm run build
# Deploy dist/ folder
```

### Executor
```bash
cd executor
npm install
# Configure .env
npm start
```

---

**Fix Status**: ✅ Complete  
**Last Updated**: August 8, 2026  
**Version**: 1.0.0
