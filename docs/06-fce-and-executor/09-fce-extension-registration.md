# FCE Extension Registration Guide

**Date**: February 8, 2026  
**Status**: Extension Not Registered on Remote Proxy

---

## 🚨 Security Note

**CRITICAL**: The old deployment key `0xce44c9...5d7dc` has been exposed in chat logs and must be considered burned. A new key has been generated and must be used for all operations going forward.

---

## Problem Summary

Your TEE node is running but can't sign rebalance payloads because your extension ID isn't recognized by Flare's remote proxy infrastructure.

**Current State**:
- ✅ TEE node running (v0.0.25)
- ✅ Connected to remote proxy: `https://tee-proxy-coston2-1.flare.rocks`
- ✅ InstructionSender deployed: `0xB4b31E86F020Cf7F1B81B35C2E2Bd2CF6DA1BE66`
- ✅ Extension ID derived: `0x00000000000000000000000000000000000000000000000000000000000101b3`
- ❌ Extension ID not registered with remote proxy (proxy only sees `0x0000...0000`)
- ❌ TEE node gets 404 errors when trying to fetch actions

**What's Blocked**:
- Auto-deployment after deposit settlement
- `executeRebalance()` calls (need valid TEE signature)

---

## Solution: Register Extension with pre-build.sh

### Step 1: Generate Fresh Key and Fund It

**New key generated** (for you to use):
```
Address:     0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21
Private key: 0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36
```

**Action required**:
1. **Fund this address with C2FLR**: https://faucet.flare.network/coston2
2. Request at least 1000 C2FLR for deployment + operations

### Step 2: Update All Configuration Files

**Files to update with new key**:

#### 1. Main project `.env`
```bash
# File: /Users/ola/Documents/hackathons/flare_yield_manager/.env
PRIVATE_KEY=0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36
DEPLOYER_ADDRESS=0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21
DAO_MULTISIG=0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21
FCC_SIGNER_ADDRESS=0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21
DEFAULT_EXECUTOR=0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21
```

#### 2. FCE scaffold `.env`
```bash
# File: /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold/.env
PROXY_PRIVATE_KEY="75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36"
INITIAL_OWNER="0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21"
DEPLOYMENT_PRIVATE_KEY="75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36"
```

#### 3. Executor `.env`
```bash
# File: /Users/ola/Documents/hackathons/flare_yield_manager/executor/.env
EXECUTOR_PRIVATE_KEY=0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36
```

### Step 3: Fix Version Mismatch (Required First)

The pre-build script is currently blocked by a version mismatch:

**Option A: Update tools/go.mod (Recommended)**
```bash
cd /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold
# Edit tools/go.mod line 9
# Change: github.com/flare-foundation/tee-proxy v0.0.18
# To:     github.com/flare-foundation/tee-proxy v0.0.21
```

**Option B: Update proxy/Dockerfile**
```bash
# Edit proxy/Dockerfile line 22
# Change: ARG TEE_PROXY_VERSION=v0.0.21
# To:     ARG TEE_PROXY_VERSION=v0.0.18
```

**Recommendation**: Use Option A (update to v0.0.21) since it's the newer version.

### Step 4: Run pre-build.sh

```bash
cd /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold

export DEPLOYMENT_PRIVATE_KEY=0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36
export CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc

./scripts/pre-build.sh --chain coston2
```

**What this does**:
1. Compiles contracts and generates Go bindings
2. Either deploys new InstructionSender or uses existing one
3. **Registers the extension on-chain with TeeExtensionRegistry**
4. Outputs `config/extension.env` with registered `EXTENSION_ID`

### Step 5: Verify Registration

After pre-build completes, verify the extension is registered:

#### A. Check what extension ID was assigned
```bash
cat /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold/config/extension.env | grep EXTENSION_ID
```

#### B. Query the remote proxy (wait 1-2 minutes for indexing)
**The tester should check**: `https://tee-proxy-coston2-1.flare.rocks/info`

Expected response should now include your extension ID instead of all zeros.

#### C. Verify on-chain registration
```bash
# Get the InstructionSender address from pre-build output
INSTRUCTION_SENDER=<address_from_output>

# Query its extension ID
cast call $INSTRUCTION_SENDER "extensionId()(uint256)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Should match the EXTENSION_ID from extension.env
```

### Step 6: Update ParentVault and Restart Services

If a new InstructionSender was deployed, update ParentVault:

```bash
# Update vault to use new InstructionSender
cast send 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 \
  "setInstructionSender(address)" \
  $NEW_INSTRUCTION_SENDER \
  --private-key 0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36 \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

Then restart TEE node with updated config:
```bash
cd /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold
./scripts/stop-services.sh
./scripts/start-services.sh
```

---

## Verification Checklist

After registration, verify:

- [ ] New key funded with C2FLR from faucet
- [ ] All `.env` files updated with new key
- [ ] Version mismatch fixed (tee-proxy v0.0.21)
- [ ] `pre-build.sh` ran successfully
- [ ] `config/extension.env` exists with `EXTENSION_ID`
- [ ] Remote proxy `/info` shows your extension ID (not zeros)
- [ ] InstructionSender contract has extensionId set
- [ ] ParentVault updated with new InstructionSender (if changed)
- [ ] TEE node restarted and showing no 404 errors
- [ ] Test rebalance instruction sent successfully

---

## Troubleshooting

### If extension ID still shows as zeros on remote proxy after 5+ minutes:

**Possible causes**:
1. Registration targeted wrong registry (not the canonical Coston2 one)
2. Remote proxy indexer is lagging
3. Registration transaction reverted

**Debug steps**:
```bash
# Check which registry was used
cast logs --from-block <REGISTRATION_BLOCK> --to-block <REGISTRATION_BLOCK> \
  --address 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Verify registration on canonical registry
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  "getTeeExtensionInstructionsSender(uint256)(address)" \
  <YOUR_EXTENSION_ID> \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
# Should return your InstructionSender address
```

### If that fails: Option B (Local Proxy)

Set up local ext-proxy with C-Chain indexer:
- Requires MySQL database with C-Chain indexed data
- More infrastructure but full control
- See: fce-extension-scaffold docs on local proxy setup

---

## Why This Matters

FCC (Flare Confidential Computing) infrastructure is very new:
- TEE-based execution shipped March 2025
- Hosted proxy may lag fresh registrations
- Scaffold scripts have sharp edges
- This is expected for cutting-edge infrastructure

The registration step is the missing link between your working TEE node and the hosted proxy's action feed.

---

## Next Steps After Registration

Once extension is registered and verified:

1. **Test rebalance instruction**:
   ```bash
   # Call sendCalculateOptimal via frontend or direct contract call
   # Watch TEE node logs for action pickup
   # Verify signature generation
   ```

2. **Test full flow**:
   - Deposit → Settlement → Auto-rebalance with TEE signature
   - Verify `executeRebalance()` succeeds with valid signature

3. **Monitor**:
   - TEE node logs for 404 errors (should be gone)
   - Proxy connectivity
   - Action processing time

---

## Security Best Practices Going Forward

**Key Management**:
```bash
# Import key to cast wallet (keeps it out of files/history)
cast wallet import testnet-deployer --interactive
# Enter private key when prompted

# Use in commands
cast send ... --account testnet-deployer
```

**Never commit**:
- Private keys to git
- `.env` files with real keys
- Always use `.env.example` templates

---

## References

- Flare FCC Docs: https://dev.flare.network/
- FCE Extension Scaffold: https://github.com/flare-foundation/fce-extension-scaffold
- TeeExtensionRegistry (Coston2): `0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`
- Remote Proxy: `https://tee-proxy-coston2-1.flare.rocks`
