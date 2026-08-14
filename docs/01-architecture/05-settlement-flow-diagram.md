# FAsset Direct Mint Settlement Flow

## Complete Flow with Fix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER DEPOSIT FLOW                                 │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: Reserve Tag
┌──────────┐
│  User    │──── registerMintingTag() ───▶ ┌────────────────┐
└──────────┘                                │ FAssetAdapter  │
     │                                      │ (0x02D4F85...) │
     │◀──── tag = 12345 ─────────────────  └────────────────┘
     │                                               │
     │                                               ▼
     │                                      ┌────────────────────┐
     │                                      │ MintingTagManager  │
     │                                      │ Tag 12345 → User   │
     └──────────────────────────────────────└────────────────────┘

Step 2: Send XRPL Payment
┌──────────┐
│  User    │──── 0.234 XRP + tag:12345 ───▶ ┌──────────────────┐
└──────────┘                                  │ Core Vault XRPL  │
                                              │ (rQS1ZhB8M...)   │
                                              └──────────────────┘
                                                       │
                                              ┌────────▼───────────┐
                                              │ XRPL Testnet       │
                                              │ TX Hash: 0xABC...  │
                                              └────────────────────┘

Step 3: Executor Detects & Processes ⚡ CRITICAL STEP
┌─────────────────┐
│ Executor Bot    │◀──── Watches XRPL ─────┐
│ (Running 24/7)  │                         │
└─────────────────┘                         │
         │                                  │
         │ 1. Validates tag 12345          │
         │ 2. Checks no pending deposit    │
         │ 3. Transfers FXRP to adapter    │
         │                                  │
         ▼                                  │
┌────────────────────────────────────────┐ │
│ FAssetAdapter.processDirectMint()      │ │
│   tag:        12345                    │ │
│   depositId:  0x79675cd6...0dc6ae      │ │
│   amount:     234000 FXRP (6 decimals) │ │
└────────────────────────────────────────┘ │
         │                                  │
         │ ✅ TX Confirmed on Coston2       │
         │                                  │
         ▼                                  │
┌────────────────────────────────────────┐ │
│ pendingDirectMints[0x79675cd6...]      │ │
│   receiver: 0x0b0692...b6114 ✅        │ │
│   tag:      12345 ✅                   │ │
│   assets:   234000 ✅                  │ │
└────────────────────────────────────────┘ │
                                            │
                                            │
Step 4: Frontend Polling ✨ NEW FIX        │
┌──────────────────┐                        │
│ Frontend UI      │─── Poll every 3s ─────┘
│ (Deposit.tsx)    │    pendingDirectMints(depositId)
└──────────────────┘
         │
         ├─ BEFORE executor processes:
         │  ┌─────────────────────────────────────┐
         │  │ 🟡 Awaiting Executor Processing...  │
         │  │ 🕐 Clock icon (pulsing)             │
         │  │ ⚠️  Waiting for on-chain            │
         │  │     confirmation...                 │
         │  │ 🔘 Button: DISABLED                 │
         │  └─────────────────────────────────────┘
         │
         ├─ AFTER executor processes:
         │  ┌─────────────────────────────────────┐
         │  │ 🟢 FAssets received!                │
         │  │ ✅ Checkmark icon                   │
         │  │ 💚 Ready to settle                  │
         │  │ 🔵 Button: ENABLED                  │
         │  └─────────────────────────────────────┘
         │
         ▼

Step 5: User Settles & Receives Shares
┌──────────┐
│  User    │──── settleDirectMint(depositId) ───▶ ┌────────────────┐
└──────────┘                                        │ FAssetAdapter  │
     │                                              └────────┬───────┘
     │                                                       │
     │                                              1. Transfer 234000 FXRP
     │                                                       │
     │                                                       ▼
     │                                              ┌────────────────┐
     │                                              │ ParentVault    │
     │                                              │ (0x01f64160...)│
     │                                              └────────┬───────┘
     │                                                       │
     │                                              2. Mint shares
     │                                                       │
     │◀──── 234000 Flux shares (fluxFXRP) ─────────────────┘
     │
     ▼
┌──────────────────┐
│ User Wallet      │
│ Balance:         │
│ 234000 Flux 🎉   │
└──────────────────┘
```

## Error Scenarios & Handling

### Scenario A: Settlement Called Too Early (BEFORE FIX) ❌
```
User clicks "Settle" 
    │
    ▼
settleDirectMint(depositId)
    │
    ▼
❌ REVERT: UnknownDirectMint(0x79675cd6...)
    │
    ▼
MetaMask: "Interaction failed"
User: Confused 😕
```

### Scenario B: Settlement with Polling (AFTER FIX) ✅
```
User sees "Awaiting Executor..."
    │
    ├─ Poll #1: assets = 0 → Stay disabled
    │
    ├─ Poll #2: assets = 0 → Stay disabled
    │
    ├─ Poll #3: assets = 0 → Stay disabled
    │
    ├─ Poll #4: assets = 234000 ✅ → Enable button!
    │
    ▼
User clicks "Settle & Receive Shares"
    │
    ▼
settleDirectMint(depositId)
    │
    ▼
✅ SUCCESS: Shares minted
User: Happy 😊
```

## Key State Transitions

```
┌────────────────┐
│ SELECT         │ User chooses XRP
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ RESERVE_TAG    │ registerMintingTag()
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ AWAITING_      │ User sends XRPL payment
│ DEPOSIT        │ Watching for payment...
└───────┬────────┘
        │
        ▼
┌────────────────┐  ← XRPL payment detected by executor
│ READY_TO_      │  ← Executor calls processDirectMint()
│ SETTLE         │  ✨ NEW: Polling until assets > 0
└───────┬────────┘
        │ ┌─────────────────────────────────┐
        │ │ isDepositProcessedOnChain?      │
        │ │ • receiver != address(0)        │
        │ │ • assets > 0                    │
        │ └─────────────────────────────────┘
        │
        ├─ NO  → Show "Awaiting Executor..." (amber UI)
        │        Button DISABLED
        │
        └─ YES → Show "FAssets received!" (green UI)
                 Button ENABLED
                 │
                 ▼
              User clicks settle
                 │
                 ▼
        ┌────────────────┐
        │ SETTLING       │ settleDirectMint() processing
        └───────┬────────┘
                │
                ▼
        ┌────────────────┐
        │ DEPLOY         │ Optional: deploy to yield strategy
        └───────┬────────┘
                │
                ▼
        ┌────────────────┐
        │ COMPLETE       │ ✅ Flux shares in wallet!
        └────────────────┘
```

## Contract State Verification

### Before Executor Processing:
```solidity
// FAssetAdapter state:
pendingDirectMints[depositId] = PendingDirectMint({
    receiver: address(0),    // ❌ Not set yet
    tag: 0,                  // ❌ Not set yet
    assets: 0                // ❌ Not set yet
});

// Frontend check:
isDepositProcessedOnChain = false  // Button DISABLED
```

### After Executor Processing:
```solidity
// FAssetAdapter state:
pendingDirectMints[depositId] = PendingDirectMint({
    receiver: 0x0b0692...b6114,  // ✅ User address
    tag: 12345,                   // ✅ Minting tag
    assets: 234000                // ✅ FXRP amount (6 decimals)
});

// Frontend check:
isDepositProcessedOnChain = true   // Button ENABLED ✅
```

## Timing Analysis

| Step | Action | Duration | Who |
|------|--------|----------|-----|
| 1 | Reserve tag | ~5s | User → Chain |
| 2 | Send XRPL payment | ~4s | User → XRPL |
| 3 | Executor detects | 0-15s | Executor polling |
| 4 | processDirectMint | ~5s | Executor → Chain |
| 5 | Frontend detects (NEW) | 0-3s | Frontend polling |
| 6 | User clicks settle | <1s | User |
| 7 | settleDirectMint | ~5s | User → Chain |

**Total**: ~25-40 seconds from XRPL payment to shares minted

**Critical Window (Fixed)**: Step 5 now waits for Step 4 confirmation! ✅

## Error Messages Decoded

| Solidity Error | User-Friendly Message |
|----------------|----------------------|
| `UnknownDirectMint(bytes32)` | "Deposit has not been processed on-chain by the executor yet. Please wait..." |
| `InsufficientFAssetBalance(uint256,uint256)` | "Adapter has not received FXRP tokens yet." |
| `UnknownPendingDeposit(bytes32)` | "ParentVault deposit queue pending." |
| Generic revert | First 200 chars of error message |

---

**Visual Guide Status**: ✅ Complete  
**Next**: Test on Coston2 testnet with real XRPL payment
