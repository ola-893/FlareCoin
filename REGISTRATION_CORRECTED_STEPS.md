# Corrected Extension Registration Steps

**Date**: August 8, 2026  
**Status**: Ready to Execute

---

## ✅ What's Been Fixed

1. **Version mismatch resolved**: `tools/go.mod` updated from tee-proxy v0.0.18 → v0.0.21
2. **Compromised key replaced**: All `.env` files now use new safe key `0x7588...eb36`
3. **Math verified independently**:
   - New key derives to: `0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21` ✅
   - Old key derives to: `0x506e724d7FDdbF91B6607d5Af0700d385D952f8a` ✅ (confirmed as burned)
   - Extension ID: `0x00000000000000000000000000000000000000000000000000000000000101b3` ✅ (valid bytes32)

---

## 🔑 Security Note on Key Exposure

**CRITICAL**: The key `0x7588...eb36` is currently **exposed in plaintext** in:
- `FCE_EXTENSION_REGISTRATION.md`
- `fce-extension-scaffold/.env`
- This chat history

For testnet C2FLR this is acceptable short-term, but:

1. **Before mainnet**: Use `cast wallet import` to store keys securely
   ```bash
   cast wallet import testnet-deployer --interactive
   # Then use: cast send ... --account testnet-deployer
   ```

2. **Never commit** private keys to git or leave them in history

3. **Rotate before mainnet** - treat this key as temporary

---

## 📋 Execution Steps

### Step 1: Fund the New Address

**Address to fund**: `0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21`

```bash
# Get testnet C2FLR from faucet
open https://faucet.flare.network/coston2
# Request 1000+ C2FLR for deployment + operations
```

Verify funding:
```bash
cast balance 0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21 \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
```

### Step 2: Run Registration Script

**⚠️ SECURITY WARNING**: This command exposes the private key in your shell history. For testnet this is acceptable, but:
- **After testing completes**, rotate this key before any mainnet deployment
- Consider this key burned once it appears in shell history
- For production, modify `pre-build.sh` to support `cast wallet` integration

```bash
cd /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold

# TESTNET ONLY - this key will be in your shell history
export DEPLOYMENT_PRIVATE_KEY=0x75885e8afdb8bfb8b2accf3c49b854d9138f34b48cd786d9df02370a7feb8f36
export CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc

./scripts/pre-build.sh --chain coston2

# Clear history after (optional)
history -d $(history 1)
```

**What this does**:
1. Compiles contracts and generates Go bindings
2. Deploys or reuses InstructionSender contract
3. **Registers extension with TeeExtensionRegistry on-chain**
4. Outputs `config/extension.env` with the registered `EXTENSION_ID`

### Step 3: Verify Registration (Most Trustworthy)

**Direct on-chain check** (this is the ground truth, not the proxy):

```bash
# Get InstructionSender address from pre-build output
INSTRUCTION_SENDER=<address_from_pre_build_output>

# Query its extension ID
cast call $INSTRUCTION_SENDER "extensionId()(uint256)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Expected output: 0x00000000000000000000000000000000000000000000000000000000000101b3
```

**If this returns your extension ID**, registration succeeded ✅

### Step 4: Check Proxy (May Lag)

The remote proxy can take 1-5 minutes to index the new registration:

```bash
# Check proxy /info endpoint
curl https://tee-proxy-coston2-1.flare.rocks/info

# Expected: Should show your extension ID instead of all zeros
```

**Note**: Proxy indexing lag doesn't block execution — the on-chain state is what matters.

### Step 5: Restart TEE Node

```bash
cd /Users/ola/Documents/hackathons/flare_yield_manager/fce-extension-scaffold
./scripts/stop-services.sh
./scripts/start-services.sh

# Watch logs
docker logs -f tee-node-coston2
```

Expected: No more 404 errors when fetching actions from proxy.

---

## 🎯 Success Criteria

After these steps, you should have:

- ✅ InstructionSender contract returns your extension ID on-chain
- ✅ Remote proxy `/info` shows your extension ID (after indexing delay)
- ✅ TEE node logs show no 404 errors
- ✅ TEE node can fetch and sign rebalance actions

---

## 🧪 Final Test: End-to-End Rebalance

Once registration is verified, test the full flow:

```bash
# 1. Send rebalance instruction via frontend or direct contract call
cast send 0xB4b31E86F020Cf7F1B81B35C2E2Bd2CF6DA1BE66 \
  "sendCalculateOptimal()" \
  --private-key $DEPLOYMENT_PRIVATE_KEY \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# 2. Watch TEE node pick up the action
docker logs -f tee-node-coston2

# 3. Verify signature generation and executeRebalance() call
# Expected: TEE node signs the payload and submits executeRebalance() transaction
```

---

## 🔍 What Was Verified Independently

The user ran these checks outside the project context:

1. **Key derivation**:
   - `0x7588...eb36` → `0x1857A6Fe4Fd06CFd4e8451d2672A96E2849e3D21` ✅ matches docs
   - `0xce44c9...5d7dc` → `0x506e724d7FDdbF91B6607d5Af0700d385D952f8a` ✅ matches settlement tx caller

2. **Extension ID format**:
   - `0x00000000000000000000000000000000000000000000000000000000000101b3` is exactly 64 hex chars ✅
   - Valid bytes32, not a formatting issue like the earlier depositId bug

3. **Flare infrastructure status**:
   - `fce-extension-scaffold`, `tee-proxy`, `tee-node` repos are active and current ✅
   - No breaking changes or deprecations since February 2026
   - Registry/InstructionSender pattern is still the correct approach

---

## 🚨 Troubleshooting

### If on-chain extensionId still returns 0:

```bash
# Check registration transaction succeeded
cast logs --from-block <REGISTRATION_BLOCK> --to-block <REGISTRATION_BLOCK> \
  --address 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc

# Verify with canonical registry
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  "getTeeExtensionInstructionsSender(uint256)(address)" \
  0x00000000000000000000000000000000000000000000000000000000000101b3 \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
# Should return your InstructionSender address
```

### If TEE node still gets 404 errors after 5+ minutes:

1. Check proxy connectivity: `curl https://tee-proxy-coston2-1.flare.rocks/info`
2. Verify extension ID in `config/extension.env` matches on-chain value
3. Restart TEE node services
4. Check TEE node env vars are pulling from correct extension.env

---

## Why This Is the Last Blocker

- ✅ **Deposit flow works**: `SETTLEMENT_VERIFIED.md` has proof (tx `0x022bdc77...`)
- ✅ **Settlement works**: FAsset transferred to vault correctly
- ✅ **TEE node runs**: Connected to remote proxy, just missing extension registration
- ❌ **Rebalance blocked**: TEE can't sign payloads until extension is registered

After registration succeeds, the only remaining test is sending a rebalance instruction and confirming `executeRebalance()` accepts the TEE signature.

---

## Next Steps After Registration

1. **Test rebalance instruction** (steps above)
2. **Monitor production flow**: Deposit → Settlement → Auto-rebalance
3. **Prepare for mainnet**: Key rotation, audit, frontend polish

---

## References

- TeeExtensionRegistry (Coston2): `0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`
- InstructionSender (deployed): `0xB4b31E86F020Cf7F1B81B35C2E2Bd2CF6DA1BE66`
- Remote Proxy: `https://tee-proxy-coston2-1.flare.rocks`
- Flare FCC Docs: https://dev.flare.network/
