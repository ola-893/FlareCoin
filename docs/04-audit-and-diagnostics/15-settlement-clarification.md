# Settlement Clarification — Architecture vs Execution

**Date**: February 8, 2026  
**Status**: Settlement Works, But Not Via TEE Path

---

## What Actually Happened

**Transaction**: `0x022bdc77f62c0c486ebd2972e10f4cf440087e9af5421ef31961f7641a1b0957`  
**Function Called**: `settleDirectMint(bytes32)`  
**Caller**: `0x506e724d7fddbf91b6607d5af0700d385d952f8a` (old exposed key)  
**Status**: Success with Transfer event (234,000 shares minted)

---

## Architecture: Two Separate Trust Paths

### Path 1: FAsset Direct Minting (What Was Tested)

**Flow**:
```
XRPL Payment → Executor detects → processDirectMint() → settleDirectMint() → Shares minted
```

**Trust Model**:
1. **`processDirectMint()`** — **EXECUTOR-ONLY** (lines 124-126):
   ```solidity
   if (msg.sender != tagExecutor[tag]) revert NotTagExecutor(msg.sender, tag);
   address activeExecutor = mintingTagManager.allowedExecutor(tag);
   if (activeExecutor != msg.sender) revert TagExecutorNotActive(tag, msg.sender, activeExecutor);
   ```
   - Only authorized executor can register deposits
   - Validates on-chain balance matches expected amount
   - Creates pending deposit record

2. **`settleDirectMint()`** — **PERMISSIONLESS** (line 160):
   ```solidity
   /// @dev Callable by anyone so a user cannot be censored after the direct-mint executor has registered funds.
   function settleDirectMint(bytes32 depositId) external override whenNotPaused nonReentrant
   ```
   - Anyone can trigger settlement AFTER executor registration
   - Anti-censorship feature by design
   - Only validates: deposit exists + sufficient balance

**Security**: Trust is at registration (executor-controlled), not settlement (user-controlled).

**No TEE signature required** — This path doesn't use FCC/TEE at all.

---

### Path 2: Vault Rebalancing (Still Blocked)

**Flow**:
```
Vault needs rebalance → sendCalculateOptimal() → TEE computes → TEE signs → executeRebalance()
```

**Trust Model**:
```solidity
// ParentVault.sol executeRebalance()
require(teeAddress != address(0), "TEE address not set");
require(status == 1, "TEE reported failure");

// EIP-191 signature verification
address recoveredSigner = ECDSA.recover(ethHash, signature);
require(recoveredSigner == teeAddress, "Invalid TEE signature");
```

**Security**: Trust is in TEE attestation + signature verification.

**This IS blocked** — Requires registered extension ID on Flare's proxy.

---

## What Was Actually Verified

✅ **FAsset deposit path works**:
- Executor can register deposits via `processDirectMint()`
- Users can settle via `settleDirectMint()` (permissionless)
- Vault mints shares correctly
- Original 0.234 XRP deposit successfully settled

❌ **TEE rebalance path NOT tested**:
- Requires valid TEE signature
- Blocked by extension registration issue
- No automatic rebalancing yet

---

## Why Settlement Didn't Need Owner Key

**Initial Assumption**: Settlement might be restricted  
**Reality**: Line 160 comment says "callable by anyone"  
**Why It Worked**: Permissionless by design (anti-censorship)

**The owner key was only needed because that's what was available.** Any address could have triggered that settlement once the executor registered the deposit.

---

## Security Analysis

### Is Permissionless Settlement Safe?

**YES** — The design is sound:

1. **Registration is gated**: Only authorized executor can call `processDirectMint()`
2. **Balance is validated**: Must match actual on-chain FAsset balance
3. **Double-registration prevented**: `processedDirectMints[depositId]` tracking
4. **Settlement just executes**: Can't mint more than registered amount

**Attack Surface**:
- Malicious caller could settle someone else's deposit early (griefing, not theft)
- User still gets correct shares to correct address
- Executor-as-trust-anchor model (standard for cross-chain bridges)

### Is the Exposed Key a Problem?

**YES** — Multiple risks:

1. **Used for settlement**: Transaction `0x022bdc7...` used exposed key
2. **Deployment authority**: Can deploy/upgrade contracts
3. **Executor role**: Can register deposits via `processDirectMint()`
4. **Owner permissions**: Various admin functions

**Impact**: Key must be rotated immediately for any production use.

---

## What Still Needs Verification

### 1. TEE Rebalance Path
- [ ] Extension registered with Flare's proxy
- [ ] TEE node can fetch actions (no 404s)
- [ ] `sendCalculateOptimal()` creates instruction
- [ ] TEE signs rebalance payload
- [ ] `executeRebalance()` succeeds with valid signature

### 2. Key Rotation
- [ ] New key generated and funded
- [ ] All config files updated
- [ ] Old key permissions revoked where possible
- [ ] New deployment with new key (if needed)

---

## Corrected Status

| Component | Status | Path |
|-----------|--------|------|
| **FAsset Deposits** | ✅ Working | Executor → Registration → Permissionless Settlement |
| **Vault Rebalancing** | ❌ Blocked | Instruction → TEE → Signature → Execution |
| **Extension Registration** | ❌ Not on proxy | Need `pre-build.sh` or manual registration |
| **Key Security** | ⚠️ Compromised | Old key exposed, needs rotation |

---

## Clarification on Earlier Claims

**What I claimed**: "Settlement works, fully operational"  
**What that meant**: FAsset deposit → settlement path works  
**What it didn't mean**: TEE-signed rebalancing works  

**Why the confusion**: 
- Both paths lead to "vault shares minted"
- Different trust models (executor vs TEE)
- Settlement success doesn't prove TEE path works

**Correction**: The FAsset deposit infrastructure is operational. The TEE rebalancing infrastructure is still blocked by extension registration.

---

## Next Steps

1. **Rotate exposed key** (IMMEDIATE):
   - Use new key: `0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36`
   - Update all `.env` files
   - Fund new address: `0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21`

2. **Register extension** (REQUIRED):
   - Fix version mismatch in fce-extension-scaffold
   - Run `pre-build.sh --chain coston2`
   - Verify extension appears on proxy `/info`

3. **Test TEE path** (AFTER registration):
   - Send rebalance instruction
   - Verify TEE picks it up
   - Check signature generation
   - Attempt `executeRebalance()`

---

## References

- FAssetAdapter.sol: Lines 115-184 (processDirectMint, settleDirectMint)
- ParentVault.sol: Lines 331-415 (executeRebalance)
- Settlement TX: `0x022bdc77f62c0c486ebd2972e10f4cf440087e9af5421ef31961f7641a1b0957`
- Explorer: https://coston2-explorer.flare.network/tx/0x022bdc77...
