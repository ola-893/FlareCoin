# FlareYield Manager - For Tester

## ✅ VAULT FULLY OPERATIONAL - VERIFIED Feb 8, 2026

### What Happened
The ParentVault on Coston2 had a corrupted `activeStrategy` state (set to `0x00000000000000000000000000000003e8` instead of a valid address), which caused `totalAssets()` to revert and blocked all settlements.

**Root Cause Confirmed**: Internal transaction trace proved the failure was **NOT a depositId mismatch**, but corrupted vault storage. See `SETTLEMENT_FAILURE_ROOT_CAUSE.md` for full forensic analysis.

### Recovery Actions Taken
1. ✅ Deployed `ParentVaultRecovery.sol` with emergency `resetActiveStrategy()` function
2. ✅ Upgraded vault proxy to recovery implementation  
3. ✅ Reset corrupted strategy to `address(0)`
4. ✅ Deployed fresh ParentVault implementation (same code, new metadata)
5. ✅ Verified functionality: `totalAssets()` = 66.275 XRP

**Recovery TX**: `0x7974aa940ca84f23d41286eaf1f2473ee2fdb3dc75e9c35a86105452320da700`

### Settlement Verified — Actual Proof
**✅ Original pending deposit successfully settled!**

- **Settlement TX**: `0x022bdc77f62c0c486ebd2972e10f4cf440087e9af5421ef31961f7641a1b0957`
- **Transfer Event**: 234,000 shares minted to user `0xb0692534faf7369e534afffa5cc55ef52e6b6114`
- **Deposit Cleared**: `pendingDirectMints` now returns zero-struct
- **See**: `SETTLEMENT_VERIFIED.md` for complete proof

### Current Vault Status
- **ParentVault**: `0x01f64160E4928Eba5607aE294F9B66090Dc323B3`
- **Active Strategy**: `address(0)` — ✅ SAFE (all code paths have guards)
- **Total Assets**: 66.275 XRP — ✅ VERIFIED
- **Settlement**: ✅ **WORKING** — Verified with Transfer event
- **Status**: ✅ **FULLY OPERATIONAL**

**The protocol is ready for production testing!**

### Bonus Fix: toBytes() Bug
While investigating the failure, we discovered and fixed a bug in the executor's depositId derivation. The bug (`toBytes()` UTF-8 encoding instead of hex decoding) didn't cause the original failure, but could cause future issues.

**Fix Applied**:
- Changed `keccak256(toBytes(xrplTxHash))` → `keccak256(\`0x${clean}\`)`
- Added defensive validation (trim, strip prefix, validate 64-hex format)
- See `executor/src/flareExecutor.ts` lines 301-307

**Still Required**: Restart executor and test with new deposit to verify fix works in practice.

---

## �🎯 One-Command Setup

**Clone the repo and start everything:**

```bash
git clone https://github.com/OlaMueller/flare-yield-manager.git
cd flare-yield-manager
npm run install:all
./start-all.sh
```

**That's it!** 🎉 The frontend will open at http://localhost:5173

## 📋 Prerequisites You Need

1. **Docker Desktop** - https://www.docker.com/products/docker-desktop
2. **Node.js 18+** - https://nodejs.org/
3. **ngrok** - https://ngrok.com/download (or `brew install ngrok/ngrok/ngrok`)
4. **MetaMask** - For wallet connection

## 🔧 Configuration Required

Before running `./start-all.sh`, you need:

1. **ngrok authentication** (one-time setup):
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```
   Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken

2. **FCE scaffold .env** (may need updates):
   - File: `fce-extension-scaffold/.env`
   - Contact me for DB credentials if needed
   - ngrok domain is already configured: `trolling-affluent-parcel.ngrok-free.dev`

All other `.env` files are pre-configured for Coston2 testnet.

## 🧪 Test Flow

1. **Start**: `./start-all.sh` (wait ~10 seconds)
2. **Open**: http://localhost:5173
3. **Connect wallet**: MetaMask → Switch to Coston2 (Chain ID: 114)
4. **Get test tokens**:
   - CFLR: https://faucet.flare.network/coston2
   - XRP: https://xrpl.org/resources/dev-tools/xrp-faucets
5. **Make a deposit**: Follow the UI
6. **Watch it work**: UI shows executor processing → settlement → shares received

## 🛑 Stop Everything

```bash
./start-all.sh --stop
```

## 📖 Need Help?

- **Full guide**: [TESTER_SETUP_GUIDE.md](./TESTER_SETUP_GUIDE.md)
- **Quick reference**: [QUICK_START.md](./QUICK_START.md)
- **Logs**: `tail -f *.log` (in project root)
- **Issues?**: Send me the error logs

## 🔗 What You're Testing

- ✅ XRPL → Flare FAsset deposits
- ✅ Off-chain executor automation
- ✅ FCE-secured settlement signing
- ✅ Multi-strategy yield vault
- ✅ Modern React UI

## 📞 Quick Checks

**Is it running?**
```bash
# Check frontend
curl http://localhost:5173

# Check FCE extension
curl http://localhost:8080/health

# Check ngrok
curl http://localhost:4040/api/tunnels

# Check Docker
cd fce-extension-scaffold && docker compose ps
```

**View logs in real-time:**
```bash
tail -f executor.log fce-extension.log frontend.log ngrok.log
```

---

**🚀 Ready? Run `./start-all.sh` and visit http://localhost:5173!**

---

## 🔍 Verify Correct Extension is Running

After starting services, confirm the TypeScript extension (not Go default) is active:

```bash
cd fce-extension-scaffold
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml images extension-tee
```

**Expected output should show:** `typescript/Dockerfile` or similar TypeScript build reference

**If you see Go/golang references:** The wrong extension built. Check:
1. `fce-extension-scaffold/.env` has `LANGUAGE=typescript`
2. Restart: `./start-all.sh --stop && ./start-all.sh`
3. Check startup logs for: `Building extension: typescript/Dockerfile`

---

## 📐 Architecture Note: fce-extension/ vs Docker TEE

- **fce-extension/** (port 8080): Development/testing server running **outside** TEE (not attested)
- **extension-tee** (Docker): Production TEE-attested extension with hardware attestation

`start-all.sh` starts both:
- Port 8080 = local dev server (for testing handlers without Docker)
- Docker extension-tee = actual attested extension (what testnet uses)

For testnet integration, only the Docker extension matters.
