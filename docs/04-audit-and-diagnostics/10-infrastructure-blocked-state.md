# Infrastructure Blocked State - Escalation Required

## Summary

Frontend JSON parsing fix (Task 4) is **code-complete and verified against primary source**, but **runtime verification is blocked** by multiple unrelated infrastructure issues.

## Issue 1: ParentVault Missing Phase 1 Fix (Ours to Fix - Upgrade Required)

### Verified State

- **Proxy address**: `0x01f64160E4928Eba5607aE294F9B66090Dc323B3`
- **Current implementation** (via ERC-1967 storage slot `0x360894a...`): `0xB78Cf1D80C197E87dCC7b2e0Fd4582E3F8ecd1A8`

**Bytecode comparison proof** (definitive):
- Deployed bytecode: **32,435 bytes**
- Current source bytecode: **33,121 bytes**
- Difference: **686 bytes** (cannot be explained by immutables alone)

**Function existence tests**:
- `fccSigner()` → Returns `address(0)` ✓ (exists - this is the EIP-712 variable from original broken version)
- `teeAddress()` → **Reverts** ✓ (does NOT exist - proves pre-Phase 1)

### Root Cause

Phase 1 signature fix was proven locally (EIP-712 → EIP-191 conversion with ecrecover trace) but **never deployed on-chain**. The proxy still points to the original broken contract from before this project started.

**Why fccSigner existing doesn't disambiguate**: Current source has BOTH `fccSigner` (legacy, unused) AND `teeAddress` (Phase 1+). The revert on `teeAddress()` combined with bytecode size difference conclusively proves the deployed version is pre-Phase 1.

### Storage Layout Corruption Fixed

**CRITICAL BUG FOUND**: The Phase 1 commit originally placed `teeAddress` at the TOP of storage variables (slot 0), which would have:
- Overwritten existing `fccSigner` value with zero
- Shifted all subsequent storage slots by 1
- Corrupted `instructionSender`, `owner`, and all other state
- **Silent corruption** (no revert, just wrong values)

**FIX APPLIED**: Moved `teeAddress` declaration to END of storage variables (slot 12), safely appending after all existing slots. Storage layout verified with `forge inspect ParentVault storage-layout`.

### Current Source Code Has

✅ Phase 1 EIP-191 signature verification (3-layer hash: resultHash → payloadHash → personal_sign)  
✅ `teeAddress` field for TEE node verification  
✅ 5-param `executeRebalance(resultData, actionId, submissionTag, status, signature)`  
⚠️ Still has `fccSigner` field (legacy, unused in executeRebalance but not removed)

### Action Required

**Upgrade proxy to current implementation** containing:
1. Phase 1 EIP-191 signature fix (replaces broken EIP-712)
2. teeAddress field and setter
3. 5-param executeRebalance signature
4. All subsequent fixes (Phase 2-3 InstructionSender integration)

**Commands**:
```bash
# Deploy new implementation
forge script script/UpgradeParentVault.s.sol:UpgradeParentVault --rpc-url https://coston2-api.flare.network/ext/C/rpc --broadcast --verify

# After upgrade, set teeAddress
cast send 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "setTeeAddress(address)" 0x614759c02c88ee1238b625c5541f5aab95b46857 --private-key $DEPLOYER_KEY --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Update instructionSender to current extension
cast send 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "setInstructionSender(address)" 0x2625b3246d44396F0781a85C2d91a5D4A6478283 --private-key $DEPLOYER_KEY --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

**TEE Address** (derived from public key): `0x614759c02c88ee1238b625c5541f5aab95b46857`
- Derivation: `keccak256(x || y)` last 20 bytes, where x and y are 32-byte public key coordinates
- Public key from `/info` endpoint:
  - x: `0x96e52209946cd21a6c9701d202846776e3d885f6e085367114dcb122af59b51f`
  - y: `0xbcfa6cddfb8554b363a1a0105640ff4f4b46a0f87dcee0ec0a3bb33112de5167`

---

## Issue 2: Instructions Not Reaching Extension (Escalate to Flare)

### Symptoms

- Instruction sent on-chain via `InstructionSender.sendInstructions()`, valid ID returned
- Test polling returns **404 - instruction never reaches proxy/extension**
- Direct health check actions (F_GET/TEE_INFO) work fine
- Earlier SAY_HELLO test **worked successfully on extension 65993** (same scaffold, different extension ID)

### Verification Performed Before Escalation

✅ **TEE Machine Status**: CONFIRMED PRODUCTION
```bash
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE "getActiveTeeMachines(uint256)(address[])" 65995
# Returns: [0x1B4943b9d06215621422A41A9b778ab3A8920F84]

cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE "getTeeMachineStatus(address)(uint8)" 0x1B4943b9d06215621422A41A9b778ab3A8920F84
# Returns: 2 (PRODUCTION)
```
Machine confirmed registered and in PRODUCTION status (not INITIALIZED).

✅ **Version Alignment**: CONFIRMED ALIGNED
- tee-node: v0.0.25 (go/go.mod, tools/go.mod)
- tee-proxy: v0.0.21 (proxy/Dockerfile, rebuilt)
- Services rebuilt and restarted after proxy version update
- Issue persists after version alignment

✅ **Test Results After Fixes**:
```
Instruction ID: 0x264d831004fc1ed37e04419c231ec304c3b0a256498f5ed802f7fbb3e55d64f1
Status: 404 (instruction never reaches proxy)
```

### Ruled Out (Self-Inflicted Causes)

✅ **Op type name collision**: `CALCULATE_OPTIMAL` and `GET_APYS` not in reserved name list from troubleshooting docs  
✅ **InstructionSender misconfiguration**: `sendInstructions()` returned valid instruction ID (didn't revert) - proves registry address correct  
✅ **Proxy DB connection**: Proxy successfully polls and processes direct actions from indexer DB  
✅ **Config file regression**: No `git diff` on `extension_proxy.coston2.docker.toml` - DB credentials unchanged

### Failed Instruction Details

**Instruction ID**: `0x6abda964dc82682bf0c836012f462ff6840225e4cbc3b47c27f07a8230a7ed2d`  
**Op Type**: `VAULT_REBALANCE` (bytes32, plain string - framework pads)  
**Op Command**: `CALCULATE_OPTIMAL` (bytes32, plain string - framework pads)  
**Sent via**: `InstructionSender` at `0x2625b3246d44396F0781a85C2d91a5D4A6478283`

**Proxy behavior**:
- Instruction ID never appears in proxy logs
- Only "direct" type actions enqueued (health checks via `/info` endpoint calls)
- No "instruction" type actions ever polled from DB

### Extension Details for Flare Support

**Extension ID**: `0x0000000000000000000000000000000000000000000000000000000000000101cb` (65995 decimal)

**TEE Public Key**:
- x: `0x96e52209946cd21a6c9701d202846776e3d885f6e085367114dcb122af59b51f`
- y: `0xbcfa6cddfb8554b363a1a0105640ff4f4b46a0f87dcee0ec0a3bb33112de5167`

**TEE Address** (derived): `0x614759c02c88ee1238b625c5541f5aab95b46857`

**InstructionSender**: `0x2625b3246d44396F0781a85C2d91a5D4A6478283`

**Proxy endpoint**: `https://trolling-affluent-parcel.ngrok-free.dev` (reserved domain - won't rotate)

**DB Configuration**:
- Host: `34.38.42.208:3306`
- Database: `indexer`
- User: `hackathon_user_57`

**Registry Addresses** (from config):
- FlareTeeManager: `0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`
- FlareSystemsManager: `0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52`
- Relay: `0xa10B672D1c62e5457b17af63d4302add6A99d7dE`
- VoterRegistry: `0x6a0AF07b7972177B176d3D422555cbc98DfDe914`

### Assessment

Matches **"Instructions Never Reach Your Extension"** troubleshooting pattern, but all documented self-inflicted causes ruled out:
- Not a reserved name collision (op names checked against full reserved list)
- Not a Solidity/config name mismatch (would log "unsupported op type", instruction ID appears nowhere)
- Not a registry misconfiguration (sendInstructions didn't revert)

Behavior consistent with **broader Coston2 shared infrastructure issue** similar to:
- FTDC availability-check thread (external dependency)
- Earlier policy sync error (external indexer lag)

**Recommendation**: Escalate to Flare with above details per "Getting Further Help" path in troubleshooting docs.

---

## Issue 3: Vault Wiring Stale (Fix After Issue 1 Resolved)

**Current state**:
- `ParentVault.instructionSender` = `0xB4b31E86F020Cf7F1B81B35C2E2Bd2CF6DA1BE66` (extension 65971 - TWO redeploys stale)
- Should be: `0x2625b3246d44396F0781a85C2d91a5D4A6478283` (extension 65995)

**Action**: Included in Issue 1 upgrade commands above.

---

## Frontend JSON Parsing Fix - Final Status

### Code Complete and Verified

✅ **TypeScript types verified against primary source**: tee-node v0.0.25 Go struct definitions at `/Users/ola/go/pkg/mod/github.com/flare-foundation/tee-node@v0.0.25/pkg/types/actions.go`

✅ **Field names match json tags exactly**:
- `ActionResponse`: `result`, `signature`, `proxySignature` (camelCase)
- `ActionResult`: 9 fields all match json tags (id, submissionTag, status, log, opType, opCommand, additionalResultStatus, version, data)

✅ **All executeRebalance call sites use 5-param structure**:
- `handleDeployToStrategy()` in Deposit.tsx
- `triggerAutoDeploy()` in Deposit.tsx

✅ **Signature field audit complete**:
- grep found only 3 occurrences
- 1 in dead code (old fce-extension, grep confirmed 0 imports)
- 2 in correct wrapper types (FCEActionResponse, ExecuteRebalanceParams)

✅ **Handler correctly signature-free**: `encodeRebalancePayload()` takes `RebalancePayload` with no signature field - TEE node signs after handler returns

✅ **TypeScript compilation passes**: No diagnostics

### What This Verification Proves

**Proven**:
- Field names correct (checked against authoritative Go source)
- Call sites pass 5 separate args (not bundled payload)
- No architectural signature-in-payload bugs remain
- Code is internally consistent

**NOT Proven** (requires runtime verification):
- Whether TypeScript `string` type correctly parses `hexutil.Bytes` serialization
- Whether custom Go types (SubmissionTag) serialize as expected
- Actual wire protocol compatibility

**Why**: Matching field names answers "did I copy the name right" - does NOT answer "does this parse correctly at runtime." That requires actual JSON from successful instruction.

### Runtime Verification Blocked

**Requires**:
1. ✅ Services running (achieved)
2. ❌ Issue 1 resolved (ParentVault upgraded with Phase 1 fix + teeAddress)
3. ❌ Issue 2 resolved (instructions reaching extension)
4. ❌ Vault wired correctly (setInstructionSender + setTeeAddress)
5. ❌ End-to-end test passing (test.sh with real instruction processing)

**Status**: Fix is code-complete. Runtime verification pending resolution of Issues 1 & 2.

---

## Next Actions

1. **Upgrade ParentVault** (Issue 1 - ours to fix)
2. **Escalate instruction delivery** (Issue 2 - send details to Flare)
3. **Wait for Issue 2 resolution** from Flare
4. **Run end-to-end test** once both resolved
5. **Get real ActionResponse JSON** to complete runtime verification
6. **Document final verified state** once all confirmed working
