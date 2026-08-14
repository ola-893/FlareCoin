# ParentVault Upgrade Execution Checklist

## Pre-Flight: Storage Layout Safety ✅

**CRITICAL ISSUE FOUND AND FIXED**: `teeAddress` was originally inserted at slot 0, which would have overwritten `fccSigner` and shifted all storage slots, corrupting owner/instructionSender/all state.

**FIX APPLIED**: Moved `teeAddress` declaration to END of storage variables (after `settledFAssetDeposits`, before `__gap`).

**Verified Safe Layout**:
```
Slot 0:  fccSigner              (original - preserved)
Slot 1:  fAssetAdapter          (original - preserved)
Slot 2:  instructionSender      (original - preserved)
Slot 3:  lastInstructionId      (original - preserved)
Slot 4:  rebalanceThreshold     (original - preserved)
Slot 5:  activeStrategy         (original - preserved)
Slot 6:  rebalanceNonce         (original - preserved)
Slot 7:  teeLastActive          (original - preserved)
Slot 8:  liquidityBufferBps     (original - preserved)
Slot 9:  approvedStrategies     (original - preserved)
Slot 10: pendingDepositReceiver (original - preserved)
Slot 11: settledFAssetDeposits  (original - preserved)
Slot 12: teeAddress             (NEW - appended safely) ← Phase 1 addition
Slot 13: __gap                  (storage gap)
```

**All original slots preserved. New variable appended. Upgrade is safe.**

---

## Execution Sequence

### Step 1: Verify Storage Layout ✅

```bash
forge inspect ParentVault storage-layout
```

**Expected**: `teeAddress` at slot 12 (after all original variables)  
**Status**: ✅ VERIFIED SAFE

---

### Step 2: Deploy Upgrade

```bash
forge script script/UpgradeParentVault.s.sol:UpgradeParentVault \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc \
  --broadcast \
  --verify
```

**Expected Output**:
- New implementation address deployed
- Proxy upgraded via UUPS `upgradeToAndCall()`
- Transaction hash and block confirmation

**Record**: New implementation address = `0x________________`

---

### Step 3: Verify Upgrade Took Effect

```bash
# Get current implementation from proxy's ERC-1967 slot
cast storage 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Should match new implementation address from Step 2
```

**Expected**: Returns new implementation address (not `0xB78Cf1D80C197E87dCC7b2e0Fd4582E3F8ecd1A8`)

---

### Step 4: Confirm New Implementation Has Phase 1 Fixes

```bash
# Test 1: fccSigner should still exist (backward compatibility)
cast call <NEW_IMPL_ADDRESS> "fccSigner()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Test 2: teeAddress should now exist (Phase 1 addition)
cast call <NEW_IMPL_ADDRESS> "teeAddress()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected**:
- `fccSigner()` → Returns address (not revert)
- `teeAddress()` → Returns address (not revert) ← **This proves Phase 1 deployed**

**If either reverts**: STOP - upgrade failed, investigate before proceeding

---

### Step 5: Set TEE Address

```bash
cast send 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 \
  "setTeeAddress(address)" \
  0x614759c02c88ee1238b625c5541f5aab95b46857 \
  --private-key $DEPLOYER_KEY \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected**: Transaction succeeds, emits `TeeAddressUpdated` event

**Verify**:
```bash
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "teeAddress()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected**: Returns `0x614759c02c88ee1238b625c5541f5aab95b46857`

---

### Step 6: Update Instruction Sender

```bash
cast send 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 \
  "setInstructionSender(address)" \
  0x2625b3246d44396F0781a85C2d91a5D4A6478283 \
  --private-key $DEPLOYER_KEY \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected**: Transaction succeeds, emits `InstructionSenderUpdated` event

**Verify**:
```bash
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "instructionSender()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected**: Returns `0x2625b3246d44396F0781a85C2d91a5D4A6478283` (extension 65995)

---

### Step 7: Verify Storage Not Corrupted

```bash
# Check owner wasn't overwritten (should still be deployer/DAO)
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "owner()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Check asset wasn't corrupted (should be FTestXRP)
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "asset()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Check instructionSender matches what we just set
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "instructionSender()(address)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected**: All return sensible addresses (not zero, not corrupt)

**If any return unexpected values**: Storage corruption occurred - THIS IS BAD

---

### Step 8: Escalate Issue 2 to Flare (Independent - Can Do Anytime)

Send to Flare support with details from `INFRASTRUCTURE_BLOCKED_STATE.md` Issue 2:

**Subject**: FCE Extension Instructions Not Reaching Proxy (Extension 65995)

**Details to Include**:
- Extension ID: 65995 (`0x0000...0101cb`)
- TEE Address: `0x614759c02c88ee1238b625c5541f5aab95b46857`
- InstructionSender: `0x2625b3246d44396F0781a85C2d91a5D4A6478283`
- Failed Instruction ID: `0x6abda964dc82682bf0c836012f462ff6840225e4cbc3b47c27f07a8230a7ed2d`
- Proxy endpoint: `https://trolling-affluent-parcel.ngrok-free.dev`
- Symptom: `sendInstructions()` returns ID but polling returns 404, proxy logs never show "instruction" type actions
- DB: `indexer` on `34.38.42.208:3306` (user: `hackathon_user_57`)

**No need to wait for upgrade completion - this is independent infrastructure issue**

---

### Step 9: Wait for Flare Resolution on Issue 2

**Cannot proceed until**: Flare confirms instruction delivery issue resolved

---

### Step 10: End-to-End Test

```bash
cd /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold
./test.sh
```

**Expected**:
1. Instruction sent successfully
2. Extension receives and processes instruction
3. Handler executes, returns ActionResult
4. TEE node signs ActionResult
5. Frontend receives signed response
6. `executeRebalance()` called with 5 params
7. Signature verification passes (EIP-191)
8. Rebalance executes

**Output**: Real ActionResponse JSON showing wire format

---

### Step 11: Runtime Verification of Frontend JSON Parsing

Once Step 10 produces real JSON:

1. Inspect actual `result`, `signature`, `proxySignature` structure
2. Verify `ActionResult.data` is hex string (not nested object)
3. Verify `submissionTag` serialization format
4. Verify `hexutil.Bytes` fields parse correctly in TypeScript
5. Confirm `executeRebalance()` receives correct 5 params

**If any field doesn't parse**: Adjust TypeScript types and retry

---

## What This Fixes

✅ **Phase 1**: Broken EIP-712 → Working EIP-191 signature verification  
✅ **Phase 1**: Missing `teeAddress` field now present  
✅ **Phase 2-3**: 5-param `executeRebalance` signature  
✅ **Phase 2-3**: InstructionSender integration  
✅ **Storage Safety**: All original slots preserved, new variable appended  

---

## Critical Safety Note

The storage layout bug (teeAddress in slot 0) was caught **before deployment**. If this upgrade had been deployed with the original variable order, it would have:

- ❌ Overwritten `fccSigner` with zero
- ❌ Made `instructionSender` read the old `fAssetAdapter` value
- ❌ Shifted all storage slots by 1
- ❌ Potentially corrupted owner/asset addresses
- ❌ **Bricked the proxy with no revert, no error, just silent corruption**

**This is exactly why storage layout checks are non-negotiable for upgrades.**

