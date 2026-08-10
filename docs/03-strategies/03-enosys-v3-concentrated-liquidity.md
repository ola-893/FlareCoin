# 🚀 Enosys V3 Strategy - Quick Start Guide

**Deployed:** `0x5A839334A11983b958a7C70a8822783db6Be4bf6`  
**Status:** ✅ Approved & Operational

---

## ⚡ Test in 3 Commands (5 minutes)

### Step 1: Approve FXRP (30 seconds)
```bash
source .env
cast send $FXRP_ADDRESS \
  "approve(address,uint256)" \
  0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  1000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $COSTON2_RPC_URL \
  --legacy
```

### Step 2: Deposit 10 FXRP (30 seconds)
```bash
cast send 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "deposit(uint256)" \
  10000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $COSTON2_RPC_URL \
  --legacy
```

**What happens:**
- 5 FXRP swapped to WC2FLR via Enosys V3
- 5 FXRP held in adapter
- You start earning 0.30% fees on every FXRP/WC2FLR swap

### Step 3: Check Balance (instant)
```bash
cast call 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "totalValue()(uint256)" \
  --rpc-url $COSTON2_RPC_URL
```

**Expected:** `10000000000000000000` (10 FXRP equivalent)

---

## 📊 Strategy Details

| Property | Value |
|----------|-------|
| **Yield Source** | Enosys V3 trading fees (0.30% per swap) |
| **Expected APY** | 5-30% (volume-dependent) |
| **Risk** | Medium (impermanent loss) |
| **Pool** | FXRP/WC2FLR |
| **Fee Tier** | 0.30% |
| **Oracle** | TWAP (10-min window) |
| **Slippage Protection** | Yes (minAmountOut) |

---

## 🔍 Monitoring Commands

```bash
source .env

# Check total value (TWAP-priced)
cast call 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "totalValue()(uint256)" \
  --rpc-url $COSTON2_RPC_URL

# Check FXRP balance
cast call 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "heldUnderlying()(uint256)" \
  --rpc-url $COSTON2_RPC_URL

# Check WC2FLR balance
cast call 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "heldPairedToken()(uint256)" \
  --rpc-url $COSTON2_RPC_URL

# Check approval status
cast call $PARENT_VAULT_ADDRESS \
  "approvedStrategies(address)(bool)" \
  0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  --rpc-url $COSTON2_RPC_URL
```

---

## 💸 Withdraw Commands

### Partial Withdrawal
```bash
# Withdraw 5 FXRP with 1% slippage tolerance
cast send 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "withdraw(uint256,uint256)" \
  5000000000000000000 \
  4950000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $COSTON2_RPC_URL \
  --legacy
```

### Full Withdrawal
```bash
# Withdraw everything with 1% slippage tolerance
cast send 0x5A839334A11983b958a7C70a8822783db6Be4bf6 \
  "withdrawAll(uint256)" \
  9900000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $COSTON2_RPC_URL \
  --legacy
```

---

## 🎯 All Deployed Strategies

| Strategy | Address | Status |
|----------|---------|--------|
| **FTSO Delegation** | `0xc529Eb4a03EC14E58598D03058DBb43B75059851` | ✅ Operational |
| **SparkDEX LP** | `0xA88327A42267C0dE171CBECA1b016dEF2e990612` | ✅ Operational |
| **Enosys V3 LP** | `0x5A839334A11983b958a7C70a8822783db6Be4bf6` | ✅ **NEW!** |
| **Smart Account** | `0xE0395E7B9Ac8B39463b85a8B20D93c2429F7D4Aa` | ⚠️ Pending |

---

## 🔗 Verified Addresses

### Strategy Configuration
- **Asset (FXRP):** `0x0b6A3645c240605887a5532109323A3E12273dc7`
- **Paired Token (WC2FLR):** `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`
- **Enosys Router:** `0xD2fD55647A90fD1f2D071e115Bb713B3C145D5e2`
- **Enosys Pool:** `0x81e7628F5add2286E798B6b77B4C5ace4C62A40E`
- **Pool Fee:** `3000` (0.30%)

### Transactions
- **Deployment:** [0x298afe...](https://coston2-explorer.flare.network/tx/0x298afe0596a0df5c3969da28f2eb845551d65b6ebc1a4926f73d2eba697ca9fe)
- **Approval:** [0xe6c502...](https://coston2-explorer.flare.network/tx/0xe6c502d10b968301e060f0c86e949f924f453c160f1d7f94ae0a667ea503fdf5)

---

## ⚠️ Important Notes

1. **Impermanent Loss Risk:** Price divergence between FXRP and WC2FLR can cause IL
2. **Testnet Only:** This is Coston2 testnet - use small amounts for testing
3. **Slippage Protection:** Always set `minAmountOut` on withdrawals
4. **TWAP Pricing:** Total value uses 10-minute TWAP, not spot price

---

## 📚 Full Documentation

- **Complete Guide:** `ENOSYS_DEPLOYMENT_SUCCESS.md`
- **Overall Status:** `YIELD_GENERATION_STATUS.md`
- **Quick Test:** `TEST_YIELD_NOW.md`

---

**Ready to earn yield from Enosys V3!** 🚀
