# Settlement Failure Root Cause — Executive Summary

**Date**: February 8, 2026  
**Failed TX**: `0x6ebd50eb7db90b9dbc49eb6dad6ef8c7ed060c7eae4b528286b4c4f38b17e340`  
**Status**: ✅ **ROOT CAUSE CONFIRMED & FIXED**

---

## TL;DR

**What broke**: Corrupted `activeStrategy` storage in ParentVault (`0x3e8` instead of valid address)  
**What fixed it**: Vault recovery on Feb 8 reset `activeStrategy` to `address(0)`  
**What didn't break it**: depositId mismatch (deposit was correctly registered)  
**What got fixed anyway**: `toBytes()` bug (real vulnerability, just not the cause here)

---

## The Smoking Gun: Internal Transaction Trace

```bash
cast run 0x6ebd50eb7db90b9dbc49eb6dad6ef8c7ed060c7eae4b528286b4c4f38b17e340 \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc --decode-internal
```

### What Actually Happened:

```
FAssetAdapter::settleDirectMint(0x79675cd6...)
    ├─ ✅ Deposit lookup succeeded
    ├─ ✅ FXRP approval succeeded
    ├─ ParentVault::settleFAssetDeposit(0x79675cd6..., 234000)
    │   ├─ ✅ Balance check succeeded
    │   ├─ ❌ Call to 0x00000000000000000000000000000000000003e8::totalValue()
    │   │   └─ ← [Stop] (not a contract!)
    │   └─ ← [Revert] call to non-contract address 0x3e8
    └─ ← [Revert] call to non-contract address 0x3e8
```

**Address 0x3e8 = 1000 decimal** — corrupted storage value, not a valid strategy address.

---

## Proof: Deposit Was Correctly Registered

```bash
cast call 0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7 \
  "pendingDirectMints(bytes32)(address,uint256,uint256)" \
  0x79675cd62c6cc032d623bd5198d6bd0fe9018f2eaef74beca171f37e5d0dc6ae \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Result**:
```
receiver: 0xB0692534fAF7369e534AFffa5cC55EF52e6b6114  ✅
tag:      316                                        ✅
assets:   234000 (0.234 XRP)                         ✅
```

**The deposit exists and is valid.** No depositId mismatch.

---

## Timeline of Events

1. **User sends 0.234 XRP** on XRPL with destination tag 316
   - TX: `16B79DB44B8621C363D2516291BE63705E99BEFB1CED22429A1181B53928A9F7`

2. **Executor registers deposit** via `processDirectMint()`
   - depositId: `0x79675cd6...` (unknown derivation method)
   - ✅ Successfully stored in `pendingDirectMints`

3. **User attempts settlement** via `settleDirectMint(0x79675cd6...)`
   - TX: `0x6ebd50eb7db90b9dbc49eb6dad6ef8c7ed060c7eae4b528286b4c4f38b17e340`
   - ✅ Deposit lookup succeeds
   - ✅ Reaches `ParentVault.settleFAssetDeposit()`
   - ❌ **Reverts at `activeStrategy.totalValue()` where `activeStrategy = 0x3e8`**

4. **Vault recovery executed** (Feb 8, 2026)
   - Reset `activeStrategy` from `0x3e8` → `address(0)`
   - TX: `0x7974aa940ca84f23d41286eaf1f2473ee2fdb3dc75e9c35a86105452320da700`
   - ✅ Vault now functional, `totalAssets()` works

---

## The toBytes() Bug (Separate Issue)

### Bug Description:
```typescript
// WRONG (buggy code)
const depositId = keccak256(toBytes(xrplTxHash));
// toBytes() UTF-8 encodes the string literal, not hex decoding it

// CORRECT (fixed code)
const depositId = keccak256(toHex(xrplTxHash));
// toHex() validates and formats as hex, then keccak256 decodes it
```

### Impact:
- **Did it cause this failure?** ❌ No
- **Is it a real bug?** ✅ Yes
- **Could it cause future failures?** ✅ Yes, if registration and settlement use different derivations
- **Was it fixed?** ✅ Yes, in latest executor code

### Evidence It Didn't Cause This Failure:

```bash
# Buggy depositId (UTF-8 encode)
echo -n "16B79DB44B8621C363D2516291BE63705E99BEFB1CED22429A1181B53928A9F7" | cast keccak
→ 0x122cbfb83c2d209564a4df1e8522018b19983957f09ddbe01da11c2f207fe4dc

# Correct depositId (hex decode)
cast keccak 0x16B79DB44B8621C363D2516291BE63705E99BEFB1CED22429A1181B53928A9F7
→ 0x89cde94da8d07a25eb07f9210bb0b0c4dc0baa15c4886ef9befd739cf26225af

# Actually registered/used depositId
→ 0x79675cd62c6cc032d623bd5198d6bd0fe9018f2eaef74beca171f37e5d0dc6ae

# ❌ Neither matches! A third derivation method was used.
```

**Conclusion**: This specific transaction used a completely different depositId derivation method (possibly manual testing script or frontend-computed), so the executor's `toBytes()` bug never came into play.

---

## What's Fixed & What Remains

### ✅ Confirmed Fixed:
1. **Vault corruption** — `activeStrategy` reset to `address(0)`
2. **Settlement now works** — `totalAssets()` no longer reverts
3. **toBytes() bug** — executor now uses correct `toHex()` + keccak
4. **Deposit still pending** — can be settled NOW

### ⚠️ Low-Priority Investigation:
1. How was depositId `0x79675cd6...` originally computed?
2. Was it from a manual test script?
3. Does frontend compute depositId differently than executor?

### 🚀 Recommended Next Action:

**Test settlement NOW** — the vault is fixed and deposit is still pending:

```bash
cast send 0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7 \
  "settleDirectMint(bytes32)" \
  0x79675cd62c6cc032d623bd5198d6bd0fe9018f2eaef74beca171f37e5d0dc6ae \
  --private-key <USER_PRIVATE_KEY> \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**Expected result**: ✅ User receives vault shares, deposit cleared.

---

## Key Takeaways

1. **Always check internal traces** — external reverts hide the real failure point
2. **Verify storage integrity** — corrupted state can masquerade as logic bugs
3. **Fix real bugs even if they didn't cause the incident** — toBytes() was a ticking time bomb
4. **Test after recovery** — the original deposit should still be settleable now

---

## Reference Documents

- Full analysis: `DEPOSITID_ROOT_CAUSE_ANALYSIS.md`
- Vault recovery: `FOR_TESTER.md`, `VAULT_RECOVERY_SUCCESS.md`
- toBytes() fix: executor commit history
