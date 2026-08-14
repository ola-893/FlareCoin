# FlareYield Manager - Tester Setup Guide

Welcome! This guide will help you set up and run the FlareYield Manager project for testing.

## 🎯 What This Project Does

FlareYield Manager is a yield optimization platform for Flare Network that:
- Accepts XRPL deposits and wraps them to FAssets
- Automatically rebalances funds across yield strategies
- Uses Flare's Confidential Execution Environment (FCE) for secure settlement
- Provides a modern React UI for deposit management

## 📋 Prerequisites

Before starting, ensure you have:

1. **Docker Desktop** (for FCE services)
   - Download: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version`

2. **Node.js v18+** (for frontend and executor)
   - Download: https://nodejs.org/
   - Verify: `node --version`

3. **ngrok** (for external FCE access)
   - Download: https://ngrok.com/download
   - Or install via Homebrew: `brew install ngrok/ngrok/ngrok`
   - Verify: `ngrok --version`
   - Configure: `ngrok config add-authtoken YOUR_TOKEN` (get from https://dashboard.ngrok.com/)

4. **Git** (to clone the repository)
   - Verify: `git --version`

## 🚀 Quick Start (3 Steps)

### Step 1: Clone and Configure

```bash
# Clone the repository
git clone https://github.com/OlaMueller/flare-yield-manager.git
cd flare-yield-manager

# Install all dependencies (this may take a few minutes)
npm run install:all
```

### Step 2: Configure Environment Variables

The project needs several `.env` files. Most are already configured for Coston2 testnet, but you may need to update a few values:

#### a) Root `.env` (Already configured, but verify):
```bash
cat .env
# Should contain XRPL and wallet addresses
```

#### b) Frontend `.env` (Already configured for Coston2):
```bash
cat frontend/.env
# Should contain contract addresses and XRPL connection details
```

#### c) Executor `.env` (Check private key):
```bash
cat executor/.env
# EXECUTOR_PRIVATE_KEY should be set to a funded Coston2 wallet
```

#### d) FCE Scaffold `.env` (Most important):
```bash
cat fce-extension-scaffold/.env
# Should contain:
# - EXTENSION_ID (already set: 65995)
# - PROXY_PRIVATE_KEY (already set)
# - DB credentials (Postgres connection details)
# - NGROK_AUTHTOKEN (for external access)
```

**🔑 Required Configuration:**
- If you need DB credentials or NGROK token, contact the developer
- The executor private key must have some testnet CFLR for gas fees

### Step 3: Start Everything with One Command

```bash
# Start all services (FCE, Executor, Frontend)
./start-all.sh
```

That's it! After ~10 seconds, you should see:

```
✅ FlareYield Manager - All Services Running

📍 Service URLs:
   Frontend:        http://localhost:5173
   FCE Extension:   http://localhost:8080
   ngrok Dashboard: http://localhost:4040
   ngrok Public:    https://trolling-affluent-parcel.ngrok-free.dev
   ...

🎉 Ready to test! Visit http://localhost:5173 to start.
```

## 🧪 Testing the Application

### 1. Access the Frontend
Open your browser to: **http://localhost:5173**

### 2. Connect Your Wallet
- Click "Connect Wallet" in the top right
- Connect MetaMask or another Web3 wallet
- Make sure you're on **Coston2 Testnet** (Chain ID: 114)
- Add Coston2 if needed: https://coston2-explorer.flare.network/

### 3. Get Test Tokens
You'll need:
- **CFLR** (for gas): https://faucet.flare.network/coston2
- **XRPL Testnet XRP** (for deposits): https://xrpl.org/resources/dev-tools/xrp-faucets

### 4. Make a Test Deposit

1. **Navigate to Deposit Page**: Click "Deposit" or "New Deposit"

2. **Enter XRPL Details**:
   - XRPL Transaction Hash (from a payment you made)
   - Amount (must match the transaction)
   - Your XRPL address

3. **Submit Deposit**: The flow is:
   ```
   Submit → Wait for Executor → Settle → Receive Vault Shares
   ```

4. **Monitor Progress**:
   - The UI will show "Awaiting Executor Processing..." while the executor detects your XRPL payment
   - Once processed on-chain, you can click "Settle & Receive Shares"
   - Settlement uses FCE to sign the transaction securely

### 5. Check Logs (If Issues Occur)

```bash
# View all logs in real-time
tail -f *.log

# Or view individually:
tail -f executor.log      # XRPL monitoring
tail -f fce-extension.log # FCE handler logs
tail -f frontend.log      # Frontend dev server
tail -f ngrok.log         # ngrok tunnel logs

# Docker services (Redis, proxy, TEE node):
cd fce-extension-scaffold
docker compose logs -f
```

## 🔧 Common Issues & Solutions

### Issue: "Docker services not starting"
**Solution:**
```bash
cd fce-extension-scaffold
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml down
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml up -d
```

### Issue: "Executor not detecting my XRPL deposit"
**Solution:**
- Check executor logs: `tail -f executor.log`
- Verify XRPL transaction is confirmed: https://testnet.xrpl.org/
- Ensure destination tag matches in both XRPL payment and UI entry

### Issue: "Settlement fails with 'FCE timeout'"
**Solution:**
- FCE services may need restart after ~5 hours of uptime (Redis PubSub timeout)
- Quick fix (preserves registration):
  ```bash
  cd fce-extension-scaffold
  docker compose restart ext-proxy
  ```

### Issue: "Frontend shows 'Wrong Network'"
**Solution:**
- Switch MetaMask to Coston2 Testnet (Chain ID: 114)
- RPC: https://coston2-api.flare.network/ext/C/rpc
- Explorer: https://coston2-explorer.flare.network/

### Issue: "Wallet has no gas"
**Solution:**
- Get testnet CFLR: https://faucet.flare.network/coston2
- Need ~1 CFLR for multiple transactions

## 🛑 Stopping the Project

```bash
# Stop all services
./start-all.sh --stop
```

This will:
- Stop all Docker containers (Redis, proxy, TEE)
- Kill Node.js processes (executor, frontend, FCE extension)
- Clean up gracefully

## 📊 Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER BROWSER                         │
│                   localhost:5173                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              FRONTEND (React + Vite)                    │
│  • Connect wallet • Submit deposits • View status       │
└──────┬──────────────────────────────────────┬───────────┘
       │                                       │
       ▼                                       ▼
┌──────────────────┐              ┌──────────────────────┐
│ COSTON2 TESTNET  │              │ FCE EXTENSION        │
│ • Smart Contracts│              │ localhost:8080       │
│ • ParentVault    │              │ • Handle rebalance   │
│ • FAssetAdapter  │              │ • Sign settlements   │
└──────┬───────────┘              └──────────┬───────────┘
       │                                     │
       │                                     ▼
       │                          ┌──────────────────────┐
       │                          │ FCE SCAFFOLD         │
       │                          │ (Docker Services)    │
       │                          │ • Redis :6382        │
       │                          │ • Proxy :6673/:6674  │
       │                          │ • TEE Node           │
       │                          └──────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│              OFF-CHAIN EXECUTOR                          │
│  • Monitor XRPL deposits                                 │
│  • Call processDirectMint() when deposits detected      │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│ XRPL TESTNET     │
│ • Monitor payments│
└──────────────────┘
```

## 📁 Project Structure

```
flare_yield_manager/
├── start-all.sh                 # ⭐ One-command startup
├── frontend/                    # React UI (Vite + TypeScript)
│   ├── src/
│   │   ├── pages/Deposit.tsx   # Main deposit flow
│   │   └── services/fceClient.ts # FCE interaction
│   └── .env                     # Frontend config
├── executor/                    # Off-chain XRPL monitor
│   ├── src/index.ts            # Main executor logic
│   └── .env                     # Executor config (private key)
├── fce-extension/              # FCE handler (TypeScript)
│   └── src/app/handlers.ts     # VAULT_REBALANCE handler
├── fce-extension-scaffold/     # FCE Docker services
│   ├── docker-compose.yaml
│   ├── docker-compose.coston2.yaml
│   └── .env                     # FCE config (DB, ngrok, etc.)
├── src/                        # Solidity contracts
│   ├── core/ParentVault.sol
│   └── adapters/FAssetAdapter.sol
└── TESTER_SETUP_GUIDE.md       # ⭐ This file
```

## 🔗 Important Addresses (Coston2)

### Smart Contracts
- **ParentVault (Proxy)**: `0x01f64160E4928Eba5607aE294F9B66090Dc323B3`
- **InstructionSender**: `0x2625b3246d44396F0781a85C2d91a5D4A6478283`
- **FAsset Adapters**: See `frontend/src/config/contracts.ts`

### FCE Extension
- **Extension ID**: `65995`
- **Registered TEE**: `0xcD53327E260f67Ca21E20EA6f4A74f5371FC8f4d`
- **Public Endpoint**: `https://trolling-affluent-parcel.ngrok-free.dev`

### Network Details
- **Chain ID**: 114 (Coston2)
- **RPC**: https://coston2-api.flare.network/ext/C/rpc
- **Explorer**: https://coston2-explorer.flare.network/
- **Faucet**: https://faucet.flare.network/coston2

## 📞 Support

If you encounter issues:

1. **Check logs first**: `tail -f *.log`
2. **Verify Docker**: `docker compose ps` (in fce-extension-scaffold/)
3. **Check contract addresses**: Ensure they match in frontend/.env
4. **Contact developer**: Provide error logs and steps to reproduce

## 🎉 Happy Testing!

The FlareYield Manager demonstrates:
- ✅ XRPL → Flare bridging via FAssets
- ✅ FCE-secured settlement execution
- ✅ Off-chain executor automation
- ✅ Modern React UI with wallet integration
- ✅ Multi-strategy yield optimization architecture

Enjoy exploring the platform! 🚀
