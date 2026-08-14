# CRITICAL: fce-extension-scaffold Repo is Stale Post-Redeploy

**Date:** August 6, 2026  
**Issue:** Scaffold repo's latest main has tee-node v0.0.21, but Coston2 redeploy requires ≥ v0.0.22

---

## The Smoking Gun

### What the Scaffold Has (Latest Main)

```go
// tools/go.mod and go/go.mod
github.com/flare-foundation/tee-node v0.0.21-0.20260619120252-31fc839ae6d2
```

### What the Telegram Pinned Message Says

> "tee-node ≥ v0.0.22 — older versions get every data-provider vote rejected, so your main queue stays empty forever."

**Result:** **"Pull latest main" is not enough.** The scaffold repo itself hasn't been updated post-redeploy.

---

## Why This is Critical

Everyone hitting these issues right now:
- ✅ Using correct FlareTeeManager (0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE)
- ✅ Pulled latest main
- ✅ Following current guides
- ❌ **Still getting v0.0.21 from go.mod** → still broken

The scaffold's own `check-versions.sh` would **pass** today and still leave you with a broken stack.

---

## The Real Fix (Not in Scaffold Repo Yet)

### 1. Get Real DB Credentials

❌ **Don't use credentials from:**
- GitHub issue responses (wrong channel)
- README files (dead credentials)
- Old docs (indexer-reader is dead)

✅ **Do use:**
- Telegram pinned message (current credentials)

### 2. Manually Update tee-node Version

**Don't trust the scaffold's go.mod pins.** Manually bump to ≥ v0.0.22:

```bash
cd fce-extension-scaffold/tools
# Edit go.mod - change tee-node line to v0.0.22 or later
# OR: Use develop branch as pinned message suggests
go mod edit -require github.com/flare-foundation/tee-node@develop
go mod edit -require github.com/flare-foundation/tee-proxy@develop
go mod tidy
```

### 3. Switch to Develop Branches

Per the Telegram pinned message:
> "tee-node + tee-proxy on develop"

The main branch pins are stale. Use develop until scaffold updates.

### 4. Re-register Everything

The redeploy might have wiped registrations:

```bash
# Fresh extension ID
./scripts/pre-build.sh

# Register with fresh challenge (capital R)
cd tools
go run ./cmd/register-tee -command rRap
```

### 5. Fix Your Tunnel

**Don't use:** trycloudflare quick tunnel (hostname changes on restart → stuck at INITIALIZED)

**Do use:**
- Named cloudflared tunnel
- Reserved ngrok domain

Tunnel rotated? Update `EXT_PROXY_URL`, re-run post-build.

---

## Why GitHub Issue #4 Won't Help

Our GitHub issue asks for DB credentials. But:
1. ❌ README credentials are dead
2. ❌ Issue template points to dead docs
3. ✅ Real credentials are in Telegram pinned message
4. ✅ Real fix requires manual go.mod update (not in issue scope)

**The issue is still worth keeping open** (documents the state), but the real fix is here.

---

## Verification Commands

### Check Your Extension Survived

```bash
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  "getTeeExtensionInstructionsSender(uint256)(address)" 65971 \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
# Should return: 0xB4b31E86F020Cf7F1B81B35C2E2Bd2CF6DA1BE66
```

✅ **Ours survived.** Extension 0x101b3 is still registered.

### Check TEE Machine State (After Registration)

```bash
# Check URL matches what you're serving
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  "getTeeMachine(address)((address,address,string))" $TEE_ADDRESS

# Check status (1 = INITIALIZED, 2 = PRODUCTION)
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE \
  "getTeeMachineStatus(address)(uint8)" $TEE_ADDRESS
```

---

## What We Know Now

### Working Already
- ✅ Extension 0x101b3 registered and survived redeploy
- ✅ InstructionSender uses correct FlareTeeManager address
- ✅ ParentVault wired to InstructionSender
- ✅ Scaffold on latest main commit

### Still Blocked
1. **tee-node version** — scaffold pins v0.0.21, need manual bump to ≥ v0.0.22 or develop
2. **DB credentials** — need from Telegram pinned message (not GitHub/README)
3. **Tunnel setup** — need named tunnel (not quick tunnel)

---

## Action Plan

### Immediate (Can Do Now)

1. **Get DB credentials from Telegram** (pinned message, not docs)
2. **Update scaffold go.mod manually** to tee-node@develop and tee-proxy@develop
3. **Run go mod tidy** in tools/ and go/ directories

### After Credentials + Version Fix

4. Copy handler code to scaffold
5. Update DB config in `config/proxy/extension_proxy.toml`
6. Start services with correct tee-node version
7. Register TEE with `register-tee -command rRap`
8. Verify TEE reaches PRODUCTION status
9. Update ParentVault with TEE address

---

## Why This Matters

This explains **every recent FCE issue**:
- Sniperchief's Discord request → dead README credentials
- Charles M S's 404 / TooMany() → old FlareTeeManager + stale tee-node
- GitHub issue #4 → asking wrong channel, would get dead creds anyway
- Anyone pulling "latest main" today → still gets v0.0.21, still broken

**The scaffold repo needs a PR to bump tee-node to v0.0.22+ in go.mod.**

Until then, manual fix required.

---

## SIMULATED_TEE Note

✅ **SIMULATED_TEE=true on Coston2 is fine for judging.**

GCP Confidential Space is **not required** for hackathon/testnet work.

---

## Bottom Line

- **Scaffold repo is stale** — latest main still pins pre-redeploy tee-node version
- **GitHub issue won't fix this** — it's a go.mod pin problem, not a credentials problem
- **Real fix: Manual go.mod update + Telegram credentials**
- **Our extension survived** — once we fix tee-node version and get creds, we're ready

**This document supersedes COSTON2_FCC_REDEPLOY_STATUS.md** with the actual root cause and fix.
