# Extension Verification Checklist

## Problem Identified

`start-all.sh` was calling Docker Compose directly, bypassing the language resolution logic in `scripts/start-services.sh`. This caused the Docker build to default to the Go Hello World extension instead of the TypeScript VAULT_REBALANCE handlers.

**Impact:** Testers running `./start-all.sh` were exercising the wrong extension entirely, causing failures unrelated to the actual TypeScript rebalancing logic.

## Fix Applied

**Date:** August 8, 2026

### Changes Made

1. **start-all.sh** - Replaced direct `docker compose` call with proper language resolution:
   - Sources `scripts/lib/language.sh`
   - Calls `load_language()` to resolve `EXTENSION_DOCKERFILE` from `.env`
   - Exports `EXTENSION_DOCKERFILE` for Docker Compose
   - Logs the resolved extension before building: `"Building extension: $EXTENSION_DOCKERFILE (language: $LANGUAGE)"`
   - Calls `./scripts/start-services.sh --chain coston2` instead of direct compose

2. **FOR_TESTER.md** - Added verification section:
   - Instructions to verify correct extension is running
   - Architecture clarification: fce-extension/ (dev server) vs extension-tee (TEE-attested)
   - Troubleshooting steps if wrong extension builds

## Verification Steps

### 1. Start Services

```bash
./start-all.sh
```

**Check startup logs for:**
```
[start-services] Language:       typescript (typescript/Dockerfile)
[start-services] Building extension: typescript/Dockerfile
```

**If you see `go/Dockerfile` instead:** The fix didn't apply correctly.

### 2. Verify Running Extension

```bash
cd fce-extension-scaffold
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml images extension-tee
```

**Expected output:**
```
CONTAINER           REPOSITORY          TAG       IMAGE ID       SIZE
extension-tee       ...                 ...       ...            ...
```

Check the image details - it should reference TypeScript build artifacts, not Go.

### 3. Verify Extension Handlers

```bash
# Check extension logs for TypeScript handler registration
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml logs extension-tee | grep -i "handler\|typescript\|vault_rebalance"
```

**Expected:** References to VAULT_REBALANCE operation types and TypeScript handler registration.

**Not expected:** Go Hello World messages, missing handler registrations.

### 4. Test Handler Endpoint

```bash
# This tests the TEE extension (not the dev server on 8080)
# Get the extension TEE container port mapping first
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml ps extension-tee

# If extension-tee exposes a health/state endpoint, test it
# (Exact endpoint depends on scaffold version)
```

## ParentVault Signature Issue - HOLD

### Finding

During verification, discovered ParentVault is running the **pre-Phase-1 broken implementation** with storage slot collision:

```bash
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "fccSigner()(address)" --rpc-url https://coston2-api.flare.network/ext/C/rpc
# Returns: 0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7 (adapter address - WRONG)

cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "teeAddress()(address)" --rpc-url https://coston2-api.flare.network/ext/C/rpc
# Returns: 0x506e724d7FDdbF91B6607d5Af0700d385D952f8a (deployer address - WRONG)
```

**Root cause:** `fccSigner()` getter reads slot 1 instead of slot 0 (old broken implementation).

**Actual storage:**
- Slot 0: `0x506e724d...` (should be fccSigner)
- Slot 1: `0x02D4F85...` (should be fAssetAdapter)

### Action Required - AFTER Extension Verification

**DO NOT upgrade ParentVault until:**

1. ✅ Extension verification above confirms TypeScript extension is running
2. ✅ Attempt a settlement with the correct extension
3. ✅ Confirm signature verification is the actual failure mode

**Why wait:** If the wrong extension was the root cause, fixing it may reveal a different failure surface than the ParentVault signature bug. The signature issue is real but may not be the current blocker.

**When ready to proceed:**

1. Deploy corrected ParentVault implementation (Phase-1 with EIP-191, correct slot reads)
2. Run full storage layout verification (STORAGE_LAYOUT_VERIFICATION_PROOF.md process)
3. Upgrade proxy via UpgradeParentVault.s.sol
4. Verify fccSigner() and teeAddress() return correct values
5. Test settlement end-to-end

## Success Criteria

- [ ] `start-all.sh` startup logs show: `Building extension: typescript/Dockerfile`
- [ ] `docker compose images extension-tee` confirms TypeScript build (not Go)
- [ ] Extension logs show VAULT_REBALANCE handler registration
- [ ] Settlement attempt with correct extension reveals actual failure mode
- [ ] If signature verification fails **then**, proceed with ParentVault upgrade
- [ ] Post-upgrade: fccSigner() and teeAddress() return correct addresses
- [ ] End-to-end deposit → settlement → shares works

## Rollback Plan

If start-all.sh breaks:

```bash
# Stop everything
./start-all.sh --stop

# Manual start with correct script
cd fce-extension-scaffold
./scripts/start-services.sh --chain coston2
cd ..

# Start other services manually
cd executor && npm start &
cd ../frontend && npm run dev &
```

## Notes

- The standalone `fce-extension/` server on port 8080 is a **dev-only** server, not TEE-attested
- For testnet, only the **Docker extension-tee** container matters (the one with hardware attestation)
- `start-all.sh` starts both for convenience, but production would only run the Docker TEE stack
