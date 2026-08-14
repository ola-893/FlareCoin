# Settlement Fix - Testing Guide

## Prerequisites

1. **Flare Coston2 Testnet Setup**
   - Network: Coston2 (Chain ID: 114)
   - RPC: https://coston2-api.flare.network/ext/C/rpc
   - Faucet: https://faucet.flare.network/coston2

2. **Executor Running**
   ```bash
   cd executor
   npm install
   # Configure .env with EXECUTOR_PRIVATE_KEY
   npm start
   ```

3. **Frontend Running**
   ```bash
   cd frontend
   npm install
   npm run dev
   # Open http://localhost:5173
   ```

4. **Wallet Setup**
   - MetaMask with Coston2 network added
   - Some C2FLR for gas fees
   - XRPL testnet wallet with XRP

## Test Scenario 1: Normal Flow (Happy Path) ✅

### Step 1: Reserve Minting Tag
1. Navigate to `/deposit` in frontend
2. Select "Native Deposit (XRP)"
3. Click "Reserve Tag & Start Deposit"
4. Confirm MetaMask transaction
5. Wait for confirmation
6. **Expected**: UI shows "Step 3: Awaiting Deposit" with tag number

### Step 2: Send XRPL Payment
1. Copy the reserved tag number (e.g., 12345)
2. Copy the Core Vault XRPL address (e.g., `rQS1ZhB8M...`)
3. Open XRPL testnet wallet (e.g., https://xrpl.org)
4. Send XRP payment:
   - To: Core Vault address
   - Amount: 0.234 XRP (or any test amount)
   - Destination Tag: Your reserved tag
5. Confirm transaction
6. **Expected**: XRPL transaction confirms in ~4 seconds

### Step 3: Executor Processing (Backend) ⚡
1. Watch executor console logs
2. **Expected logs**:
   ```
   [Main] Detected XRPL Payment!
   TX Hash : ABC123...
   Tag     : 12345
   Amount  : 0.234000 XRP
   
   [Flare][Tag 12345] Tag belongs to user 0x0b0692...
   [Flare][Tag 12345] Provisioning 0.234000 FXRP to FAssetAdapter...
   [Flare][Tag 12345] FXRP transfer confirmed in block 12345
   [Flare][Tag 12345] Calling processDirectMint(12345, 0x79675..., 234000)...
   [Flare][Tag 12345] ✅ processDirectMint confirmed in block 12346!
   ```

### Step 4: Frontend Polling & Detection ✨ NEW FIX
1. Watch frontend UI (no manual action needed)
2. **Expected UI sequence**:

   **Initial State** (0-30 seconds):
   ```
   🟡 Step 4: Awaiting Executor Processing...
   🕐 Clock icon (pulsing)
   ⚠️  Informational banner:
       "The executor bot must call processDirectMint() 
        before you can settle..."
   
   Status: "Checking on-chain status every 3 seconds..."
   Button: "Awaiting Executor..." (DISABLED, spinning)
   ```

   **After Executor Processes**:
   ```
   🟢 Step 4: FAssets received!
   ✅ Checkmark icon
   💚 Amount: 0.234000 XRP
   
   Button: "Settle & Receive Shares" (ENABLED) ✅
   ```

3. **Expected behavior**:
   - UI automatically transitions from amber to green
   - No manual refresh needed
   - Button becomes clickable when ready

### Step 5: Settle & Receive Shares
1. Click "Settle & Receive Shares" button
2. Confirm MetaMask transaction
3. Wait for confirmation (~5 seconds)
4. **Expected**: 
   - Transaction succeeds ✅
   - UI moves to "Step 5: Deploy to Strategy"
   - Flux shares appear in wallet

## Test Scenario 2: Early Settlement Attempt (Error Handling) ⚠️

### Purpose
Verify that the UI prevents early settlement and shows proper error messages.

### Steps
1. Complete Steps 1-2 from Scenario 1
2. **Immediately after XRPL payment** (before executor processes):
   - **Expected UI**: Amber "Awaiting Executor..." state
   - **Button**: DISABLED with spinner
   - **Polling**: "Checking on-chain status every 3 seconds..."

3. Try to inspect browser console:
   ```javascript
   // In DevTools console, check contract state:
   await readContract({
     address: '0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7',
     abi: FASSET_ADAPTER_ABI,
     functionName: 'pendingDirectMints',
     args: [depositId]
   });
   // Should return: [address(0), 0, 0] initially
   ```

4. **Expected**: Cannot click button until executor finishes

## Test Scenario 3: Manual Error Injection (Developer Testing)

### Purpose
Test error message decoding for different revert reasons.

### Setup
Temporarily modify `handleSettle` to force errors:

```typescript
const handleSettle = () => {
  // TEST: Force error message
  setSettlementErrorMessage('UnknownDirectMint(0x123...)');
  return;
  
  // Original code...
};
```

### Expected Error Messages

| Injected Error | Expected Display |
|----------------|------------------|
| `UnknownDirectMint` | "Deposit has not been processed on-chain by the executor yet. Please wait..." |
| `InsufficientFAssetBalance` | "Adapter has not received FXRP tokens yet." |
| `UnknownPendingDeposit` | "ParentVault deposit queue pending." |

## Test Scenario 4: Network Delays

### Purpose
Verify polling works correctly with network issues.

### Steps
1. Complete Steps 1-2 from Scenario 1
2. Throttle network in DevTools:
   - Open DevTools → Network tab
   - Set to "Slow 3G"
3. Watch executor process payment
4. **Expected**:
   - Polling continues every 3 seconds
   - UI eventually detects successful processing
   - May take a few extra polls due to network throttle

## Test Scenario 5: Executor Offline/Delayed

### Purpose
Verify UI handles case where executor is not running.

### Steps
1. Stop the executor (`Ctrl+C` in executor terminal)
2. Complete Steps 1-2 from Scenario 1 (reserve tag, send XRPL)
3. **Expected UI**:
   - Stays in "Awaiting Executor Processing..." state
   - Button remains DISABLED
   - Polling continues indefinitely
   - No crashes or errors

4. Start executor again:
   ```bash
   cd executor && npm start
   ```

5. **Expected**:
   - Executor picks up the payment (if within polling interval)
   - Frontend automatically detects and enables button
   - User can proceed with settlement

## Verification Checklist

After each successful test, verify:

- [ ] **Frontend State**
  - [ ] Polling starts when depositId is set
  - [ ] Polling interval is 3 seconds
  - [ ] UI shows amber state while waiting
  - [ ] UI transitions to green when ready
  - [ ] Button enables only when assets > 0

- [ ] **Blockchain State**
  - [ ] `pendingDirectMints[depositId].receiver` = user address
  - [ ] `pendingDirectMints[depositId].assets` = FXRP amount
  - [ ] Settlement transaction succeeds
  - [ ] FXRP transferred to ParentVault
  - [ ] Flux shares minted to user

- [ ] **Error Handling**
  - [ ] Button cannot be clicked early
  - [ ] Error messages are user-friendly
  - [ ] No "Interaction failed" generic errors
  - [ ] Polling continues on network issues

- [ ] **User Experience**
  - [ ] No manual refresh needed
  - [ ] Clear visual feedback at each stage
  - [ ] Progress indicators work correctly
  - [ ] Informational messages are helpful

## Common Issues & Troubleshooting

### Issue 1: Button Stays Disabled Forever
**Symptoms**: UI shows "Awaiting Executor..." but never enables.

**Check**:
1. Is executor running? (`npm start` in executor folder)
2. Does executor have FXRP balance? (Check console logs)
3. Did XRPL payment use correct tag and address?
4. Check browser console for `pendingDirectMints` calls

**Fix**:
- Restart executor
- Request FXRP from faucet for executor wallet
- Verify XRPL transaction on https://testnet.xrpl.org

### Issue 2: Settlement Reverts Despite Button Enabled
**Symptoms**: Button is green/enabled but transaction still reverts.

**Check**:
1. Browser DevTools console for actual error
2. Executor logs for `processDirectMint` confirmation
3. Block explorer for the attempted settlement transaction

**Debug**:
```javascript
// In browser console:
const depositId = '0x79675cd6...0dc6ae';
const result = await readContract({
  address: '0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7',
  abi: FASSET_ADAPTER_ABI,
  functionName: 'pendingDirectMints',
  args: [depositId]
});
console.log('Pending Direct Mint:', result);
// Should show [receiver, tag, assets] all non-zero
```

### Issue 3: Polling Stops Working
**Symptoms**: UI freezes in "Awaiting..." state, no network requests.

**Check**:
1. Browser console for React errors
2. Network tab for failed requests
3. Is step still 'READY_TO_SETTLE'?

**Fix**:
- Refresh page
- Clear localStorage: `localStorage.clear()`
- Check contract addresses in `.env`

## Performance Metrics

Expected timings for successful flow:

| Step | Duration | Cumulative |
|------|----------|------------|
| Tag registration | 5s | 5s |
| XRPL payment | 4s | 9s |
| Executor detection | 0-15s | 9-24s |
| processDirectMint | 5s | 14-29s |
| Frontend polling (max) | 3s | 17-32s |
| User settlement | 5s | 22-37s |

**Total**: 22-37 seconds from start to Flux shares in wallet

## Automated Testing Commands

### Build Verification
```bash
cd frontend
npm run build
# Should complete without errors
```

### Type Check
```bash
cd frontend
npx tsc --noEmit
# May show config warnings, but no actual code errors
```

### Lint
```bash
cd frontend
npm run lint
```

## Success Criteria

✅ **Test Passes If**:
1. Button disabled during executor processing
2. Polling shows "every 3 seconds" message
3. UI transitions from amber → green automatically
4. Button enables when `assets > 0`
5. Settlement succeeds without reverts
6. Shares appear in user wallet
7. Error messages are user-friendly
8. No "Interaction failed" generic errors

❌ **Test Fails If**:
1. User can click settle before executor finishes
2. Transaction reverts with `UnknownDirectMint`
3. UI never transitions to green state
4. Polling stops or crashes
5. Button enables but settlement still fails
6. Error messages are confusing

---

**Testing Status**: Ready for QA  
**Recommended Test Order**: Scenarios 1 → 2 → 4 → 5  
**Critical Test**: Scenario 1 must pass completely  
**Risk**: Scenario 2 (should gracefully prevent early settlement)
