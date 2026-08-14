# ⚡ Flux: Multi-Vault Yield Aggregator & Autonomous TEE Rebalance Engine

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Flare Coston2](https://img.shields.io/badge/Network-Flare%20Coston2%20(114)-red.svg)
![FDC Verified](https://img.shields.io/badge/FAssets-FDC%20Verified-emerald.svg)
![FCC TEE](https://img.shields.io/badge/Confidential%20Compute-TEE%20Enclave-purple.svg)
![ERC-4626](https://img.shields.io/badge/Vault-ERC--4626%20Upgradeable-green.svg)

Flux combines **Flare Data Connector (FDC) non-custodial FAssets direct minting** with **Flare Confidential Compute (FCC / TEE) autonomous strategy rebalancing** and **multi-protocol yield compounding** on the Flare Network.

**🏆 Built for the Flare Network Hackathon: Interoperable Asset Products & Flare Confidential Compute (FCC)**

---

## 📺 Live Demo & Video

| Resource | Link |
|----------|------|
| **Demo Video** | [Watch on YouTube (Demo Walkthrough)](https://www.youtube.com/watch?v=9k0vSpx6BMk) |
| **Live dApp (Primary)** | [https://yield-flux.netlify.app](https://yield-flux.netlify.app) |
| **Mirror 1** | [https://flux-protocol-coston2.netlify.app](https://flux-protocol-coston2.netlify.app) |
| **Mirror 2** | [https://flareyield-manager-coston2.netlify.app](https://flareyield-manager-coston2.netlify.app) |
| **GitHub Repo** | [https://github.com/ola-893/Flux](https://github.com/ola-893/Flux) |
| **ParentVault FXRP (Coston2)** | [`0x01f64160E4928Eba5607aE294F9B66090Dc323B3`](https://coston2-explorer.flare.network/address/0x01f64160E4928Eba5607aE294F9B66090Dc323B3) |
| **FdcDirectMintAdapter (Coston2)** | [`0xDd305DEe5a175575C74c62FC74065efb57e06ace`](https://coston2-explorer.flare.network/address/0xDd305DEe5a175575C74c62FC74065efb57e06ace) |

---

## 🏁 Quick Start (5 Minutes)

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MetaMask](https://metamask.io/) or any Web3 browser wallet
- [Foundry](https://getfoundry.sh/) (optional, for contract testing)

### Step 1: Clone & Install

```bash
git clone https://github.com/ola-893/Flux.git
cd Flux
npm run install:all
```

### Step 2: Run the App

```bash
npm run dev:frontend
```

Open [http://localhost:5200](http://localhost:5200) (or visit the live deployment at [https://yield-flux.netlify.app](https://yield-flux.netlify.app)).

### Step 3: Connect & Test

1. **Add Flare Coston2 to MetaMask**:
   - **Network Name**: Flare Coston2 Testnet
   - **RPC URL**: `https://coston2-api.flare.network/ext/C/rpc`
   - **Chain ID**: `114`
   - **Currency Symbol**: `C2FLR`
   - **Block Explorer**: `https://coston2-explorer.flare.network`

2. **Get Test Tokens**:
   - **C2FLR (Gas)**: [Flare Coston2 Faucet](https://faucet.flare.network/coston2)
   - **Test XRP (Deposit)**: [XRPL Testnet Faucet](https://xrpl.org/resources/dev-tools/xrp-faucets)

3. **Deposit via FDC Direct Mint**:
   - Go to the **Deposit** tab and select **XRP Vault**.
   - Reserve a unique destination tag on Flare (`registerMintingTag`).
   - Send test XRP (e.g. `0.5 XRP`) from your XRPL wallet to the displayed FAssets Core Vault address with your destination tag.
   - Paste the XRPL transaction hash into the dApp.
   - Click **Request FDC Attestation** (the Flare Data Connector indexes and verifies the payment Merkle proof within 90–180s).
   - Click **Relay Proof & Mint Shares** — verified `FXRP` is minted and deposited directly into `ParentVault`, crediting you auto-compounding ERC-4626 vault shares!

4. **Watch Yields Auto-Compound**:
   - View your live position, real-time APY, strategy allocations, and underlying asset values on the **Dashboard**!

> **Note**: All smart contracts, adapters, and FDC verifiers are **fully deployed and live on Coston2** — no local blockchain setup or contract deployment required!

---

## 📋 Deployed Contracts (Flare Coston2 - Chain ID: 114)

| Component / Vault | Address / ID (Coston2) | Underlying Asset / Role | Status |
|---|---|---|---|
| **`ParentVault_FXRP`** | [`0x01f64160E4928Eba5607aE294F9B66090Dc323B3`](https://coston2-explorer.flare.network/address/0x01f64160E4928Eba5607aE294F9B66090Dc323B3) | `FTestXRP` (`0x0b6A...3dc7`) | ✅ **LIVE & UPGRADED** |
| **`FdcDirectMintAdapter`** | [`0xDd305DEe5a175575C74c62FC74065efb57e06ace`](https://coston2-explorer.flare.network/address/0xDd305DEe5a175575C74c62FC74065efb57e06ace) | FDC `XRPPayment` proof → atomic FXRP deposit | ✅ **LIVE & WIRED** |
| **`ParentVault_CDP`** | [`0x71cF7B0f792400a2533e917bcfB3892b34b569e8`](https://coston2-explorer.flare.network/address/0x71cF7B0f792400a2533e917bcfB3892b34b569e8) | `Enosys CDP` (`0x41D5...059`) | ✅ **LIVE & UPGRADED** |
| **`InstructionSender`** | [`0x94A838fb58B226b0EB01Fa8DdE3758806AcE1Ba7`](https://coston2-explorer.flare.network/address/0x94A838fb58B226b0EB01Fa8DdE3758806AcE1Ba7) | Production Instruction Sender | ✅ **ACTIVE & WIRED** |
| **Extension ID** | `66166` (`0x...10276`) | Registered FCE Extension | ✅ **ON-CHAIN REGISTERED** |
| **TEE Machine** | [`0xda05085B0c7c6Fad7a657c189e91a50c12d74210`](https://coston2-explorer.flare.network/address/0xda05085B0c7c6Fad7a657c189e91a50c12d74210) | Active TEE Node | ✅ **PRODUCTION (Status 2)** |
| **`FtsoV2DelegationAdapter`** | [`0xc529Eb4a03EC14E58598D03058DBb43B75059851`](https://coston2-explorer.flare.network/address/0xc529Eb4a03EC14E58598D03058DBb43B75059851) | `FXRP` $\rightarrow$ `WNAT` Delegation | ✅ **APPROVED (Vault 1)** |
| **`SparkDexAdapter`** | [`0xA88327A42267C0dE171CBECA1b016dEF2e990612`](https://coston2-explorer.flare.network/address/0xA88327A42267C0dE171CBECA1b016dEF2e990612) | `FXRP / WC2FLR` DEX LP | ✅ **APPROVED (Vault 1)** |
| **`EnosysCdpAdapter`** | [`0x276BBc877C3d50e50848E7ca8c68241D959F4800`](https://coston2-explorer.flare.network/address/0x276BBc877C3d50e50848E7ca8c68241D959F4800) | `CDP / WC2FLR` V3 LP | ✅ **APPROVED (Vault 2)** |
| **`WNat / WC2FLR`** | [`0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273`](https://coston2-explorer.flare.network/address/0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273) | Native Wrapped C2FLR | ✅ Active |
| **`FlareContractRegistry`** | [`0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`](https://coston2-explorer.flare.network/address/0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019) | Flare System Registry | ✅ Active |

---

## ⚙️ Advanced Setup

### Environment Variables (Optional)

Copy `.env.example` to `.env` to configure custom RPC providers or deploy keys:

```bash
cp .env.example .env
```

```env
# Coston2 Network Configuration
COSTON2_RPC_URL="https://coston2-api.flare.network/ext/C/rpc"
CHAIN_ID=114

# Optional: Deployer Key for Smart Contract Deployments
PRIVATE_KEY="YOUR_PRIVATE_KEY"

# Flare Contract Registry
FLARE_CONTRACT_REGISTRY="0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
```

### Deploy Your Own Contracts (Foundry)

```bash
# Build contracts
forge build

# Deploy FdcDirectMintAdapter
forge script script/DeployFdcDirectMintAdapter.s.sol --rpc-url https://coston2-api.flare.network/ext/C/rpc --broadcast
```

### Run Tests

```bash
# Run Foundry smart contract tests (66 / 66 tests passing)
forge test

# Run FCE TEE Extension tests (35 / 35 tests passing)
npm test --prefix fce-extension
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:frontend` | Start frontend local development server |
| `npm run build:frontend` | Build production frontend bundle |
| `npm test` | Run Foundry and extension test suites |
| `npm run trigger:rebalance` | Trigger on-chain FCC rebalance request |
| `npm run relay:rebalance` | Relay TEE-signed rebalance result to vault |

---

## 🔄 The Hybrid Dual-Tier Approach: FDC Native Verification + TEE Confidential Rebalancing

### Why Both?

| Approach | Best For | Limitation | Flux Hybrid Implementation |
|----------|----------|------------|----------------------------|
| **FDC Native Verification** | Non-smart contract payment verification (XRPL $\rightarrow$ Flare) | Verification only, no execution logic | **Verifies XRPL payment Merkle proof and mints FXRP atomically** |
| **FCC / TEE Enclave** | Confidential strategy evaluation & signing | Off-chain compute only | **Computes optimal APYs confidentially and signs rebalance actions** |
| **Flux Dual-Tier** | **Complete cross-chain DeFi lifecycle** | **None — full end-to-end security!** | **FDC proof minting + TEE yield optimization** |

### How It Works

```
1. User sends native XRP payment to FAssets Core Vault with assigned destination tag
2. Flare Data Connector (FDC) consensus verifies XRPL payment Merkle proof
3. FdcDirectMintAdapter relays proof to AssetManager and deposits FXRP into ParentVault
4. ParentVault issues ERC-4626 yield shares to user
5. TEE Confidential Enclave analyzes multi-protocol APYs (FTSO v2, SparkDEX, Enosys)
6. TEE signs domain-separated EIP-191 Rebalance Action
7. ParentVault verifies TEE signature on-chain and moves funds into optimal strategy
```

---

## 🤖 The Cross-Chain DeFi Yield Problem

**The Challenge:** Non-smart-contract assets (like XRP and BTC) make up over 60% of crypto market capitalization, but cannot natively participate in DeFi yield protocols:
- Holders must either leave capital idle or trust centralized custodial bridges.
- Public on-chain rebalancing strategies suffer from **MEV sandwich attacks**, front-running, and flash-loan price manipulation.
- Manual yield farming across multiple protocols requires continuous monitoring, gas spending, and high slippage risks.

**Traditional Solutions Fail:**
- ❌ **Centralized Bridges / Wrapped Tokens**: Vulnerable to multi-sig compromises and catastrophic bridge hacks.
- ❌ **Public On-Chain Rebalancers**: Expose strategy decisions in the public mempool before execution, enabling arbitrageurs to front-run trades.
- ❌ **Single-Protocol Vaults**: Cannot dynamically migrate capital when market APYs shift.

**Flux Solution:**
- ✅ **FDC Cryptographic Verification**: Non-custodial FAssets minting verified by Flare network validators.
- ✅ **Confidential TEE Routing**: Off-chain strategy evaluation protected from MEV and front-running.
- ✅ **ERC-4626 Multi-Vault Standard**: Unified auto-compounding liquidity with instant redemption.
- ✅ **FTSO v2 Oracle Integration**: Real-time pricing with 10-minute TWAP protection.

---

## 🚀 Key Features

### 🛡️ FDC-Verified FAssets Direct Minting
- **Zero Centralized Bridges**: Uses Flare Data Connector Merkle proofs verified by network validators.
- **Atomic Mint & Deposit**: Single on-chain settlement turns XRPL payments into yield-bearing vault shares.
- **Relayer Resilience**: Integrated `try/catch` architecture handles both first-party user submission and background network relayers seamlessly.

### 🔒 Flare Confidential Compute (FCC / TEE) Rebalancing
- **MEV-Protected Routing**: Strategy yields calculated confidentially inside a secure hardware enclave.
- **EIP-191 Cryptographic Authentication**: Vault verifies TEE machine signature, nonce, deadline, and TWAP before moving funds.
- **Same-Strategy Top-Up**: Automatically compounds new idle capital into active strategies without unnecessary withdrawal cycles.

### 📈 Multi-Strategy ERC-4626 Vault Architecture
- **FTSO v2 Oracle Delegation**: Native reward compounding via Flare FTSO delegation (3–8% APY).
- **SparkDEX DEX Liquidity**: Automated concentrated liquidity provisioning for swap fees (5–15% APY).
- **Enosys V3 Concentrated Liquidity**: Automated tick management for CDP & token pairs (8–20% APY).

### ⚡ Institutional-Grade Cross-Chain Web Dashboard
- **Live Asset Valuation**: Real-time pricing powered by FTSO v2 oracle feeds.
- **Step-by-Step Direct Mint**: Visual progress tracking through XRPL payment, FDC round consensus, and vault settlement.
- **Transparent Position Tracking**: Comprehensive breakdown of assets, shares, accrued yields, and underlying strategy health.

---

## 🎯 Use Cases

### 1. Zero-Bridge XRPL Direct Yield Deposit
```solidity
// User reserves destination tag, pays XRPL, and relays Merkle proof
function executeFdcDirectMint(IXRPPayment.Proof calldata payment) external returns (uint256 shares);
// Verified FXRP is minted and converted into ParentVault ERC-4626 shares atomically
```

### 2. Confidential Strategy Rebalancing inside TEE
```typescript
// TEE enclave calculates optimal risk-adjusted APYs confidentially
const apys = await calculateStrategyAPYs(request.approvedStrategies);
const optimalStrategy = selectOptimalStrategy(apys);
// Enclave signs EIP-191 ActionResult with domain-separated payload hash
```

### 3. FTSO v2 Native Oracle Delegation Yield
```solidity
// Strategy adapter automatically delegates underlying tokens to top-performing FTSO v2 data providers
function claimRewards() external returns (uint256 claimedAssets);
```

### 4. Instant ERC-4626 Liquidity Redemptions
```solidity
// Withdraw underlying assets anytime with standard ERC-4626 semantics
function withdraw(uint256 assets, address receiver, address owner) public returns (uint256 shares);
```

---

## 💡 Why FDC + Flare Confidential Compute?

| Feature | Traditional Bridges | Public Rebalancers | Flux Dual-Tier |
|---------|-------------------|-------------------|----------------|
| **Cross-Chain Security** | Multi-sig federation | N/A | **Validator-Attested FDC Proofs** |
| **Rebalance Privacy** | ❌ None | ❌ Public Mempool | **✅ Hardware TEE Confidentiality** |
| **MEV Protection** | ❌ Vulnerable | ❌ Front-runnable | **✅ Zero Mempool Leakage** |
| **Oracle Integration** | Off-chain API | Static Oracle | **FTSO v2 Sub-Second Feeds** |
| **Standardization** | Proprietary wrapper | Custom Vaults | **ERC-4626 Standard** |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Flux Architecture                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐         Native XRPL Payment          ┌────────────────┐ │
│   │  XRPL User   │ ────────────────────────────────────▶│  Core Vault   │ │
│   │    Wallet    │                                      │ (FAssets XRPL) │ │
│   └──────┬───────┘                                      └───────┬────────┘ │
│          │                                                      │           │
│          │                                          Payment Tx  │           │
│          ▼                                                      ▼           │
│   ┌──────────────┐     Requests & Relays Proof      ┌────────────────────┐ │
│   │  Flux dApp   │ ────────────────────────────────▶│ Flare Data Conn.   │ │
│   │  (Frontend)  │                                  │ (FDC Attestation)  │ │
│   └──────┬───────┘                                  └───────────┬────────┘ │
│          │                                                      │           │
│          │                                      Merkle Payment  │           │
│          ▼                                      Proof Relayed   ▼           │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                        FdcDirectMintAdapter                          │ │
│   │   • Calls AssetManager.executeDirectMinting()                        │ │
│   │   • Verifies exact net minted FXRP balance                           │ │
│   │   • Queues & settles deposit in ParentVault                          │ │
│   └──────────────────────────────────┬───────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                      ParentVault (ERC-4626)                          │ │
│   │   • Mints Flux receipt shares to user                                │ │
│   │   • Holds underlying FXRP capital                                    │ │
│   │   • Emits RebalanceRequested → InstructionSender                     │ │
│   └──────────────────────┬──────────────────────────┬────────────────────┘ │
│                          │                          │                       │
│     Rebalance Trigger    │                          │ Verified Execution    │
│     (InstructionSender)  ▼                          ▲ (executeRebalance)    │
│   ┌──────────────────────────────┐                  │                       │
│   │   Flare Confidential Compute │ ─────────────────┘                       │
│   │   (FCC / TEE Enclave Node)   │   EIP-191 Signed Rebalance Action        │
│   └──────────────┬───────────────┘                                          │
│                  │                                                          │
│                  ▼ Deploys Capital                                          │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                         Strategy Adapters                            │ │
│   │   ┌──────────────────────┐ ┌──────────────────┐ ┌────────────────┐   │ │
│   │   │  FtsoV2Delegation    │ │ SparkDexAdapter  │ │ EnosysCdp      │   │ │
│   │   │  (WNAT 3-8% APY)     │ │ (DEX LP 5-15%)   │ │ (V3 LP 8-20%)  │   │ │
│   │   └──────────────────────┘ └──────────────────┘ └────────────────┘   │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Component | Technology | Description |
|-----------|------------|-------------|
| **Blockchain** | Flare Coston2 Testnet (Chain ID: 114) | EVM Layer 1 with native data protocols |
| **Data Verification** | Flare Data Connector (FDC) | Validator-attested Merkle proofs for XRPL |
| **Confidential Compute** | Flare Confidential Compute (FCC / TEE) | Secure enclave strategy routing and signing |
| **Oracle Feeds** | Flare FTSO v2 | Native decentralized price feeds & TWAP |
| **Smart Contracts** | Solidity 0.8.24, OpenZeppelin Upgradeable | ERC-4626 tokenized vaults and adapters |
| **Contract Tooling** | Foundry (`forge`, `cast`) | Compilation, deployment scripts, unit testing |
| **Frontend Framework** | React 18, TypeScript, Vite | Modern responsive Web3 interface |
| **Web3 Libraries** | Viem, Wagmi, TanStack Query | Type-safe Ethereum & Flare interactions |
| **Styling & Motion** | Tailwind CSS, Framer Motion, Lucide Icons | Premium glassmorphic design system |

---

## 🔄 Mainnet Migration

When deploying to Flare Mainnet:

| Parameter | Coston2 Testnet (Current) | Flare Mainnet (Production) |
|---|---|---|
| **Chain ID** | `114` | `14` |
| **RPC Endpoint** | `https://coston2-api.flare.network/ext/C/rpc` | `https://flare-api.flare.network/ext/C/rpc` |
| **Native Token** | `C2FLR` | `FLR` |
| **FAssets Token** | `FTestXRP` | `FXRP` |
| **TEE Attestation Mode** | Simulated TEE Mode (`SIMULATED_TEE=true`) | Hardware Attested (GCP Confidential VM) |
| **Explorer** | [coston2-explorer.flare.network](https://coston2-explorer.flare.network) | [flare-explorer.flare.network](https://flare-explorer.flare.network) |

---

## 📁 Project Structure

```
flare_yield_manager/
├── src/                               # Smart Contracts (Solidity 0.8.24)
│   ├── core/
│   │   └── ParentVault.sol            # Master ERC-4626 upgradeable vault
│   ├── adapters/
│   │   ├── FdcDirectMintAdapter.sol   # FDC-verified direct mint adapter
│   │   ├── FtsoV2DelegationAdapter.sol# FTSO delegation strategy
│   │   ├── SparkDexAdapter.sol        # SparkDEX LP strategy
│   │   └── EnosysCdpAdapter.sol       # Enosys concentrated liquidity strategy
│   ├── fce/
│   │   └── InstructionSender.sol      # FCE instruction dispatcher
│   └── interfaces/                    # Protocol and ERC-4626 interfaces
├── fce-extension/                     # Flare Confidential Compute (TEE)
│   ├── src/
│   │   ├── app/
│   │   │   ├── handlers.ts            # Optimal strategy calculation
│   │   │   └── config.ts              # Strategy addresses and parameters
│   │   ├── base/                      # FCE framework & server
│   │   └── main.ts                    # Extension entry point
│   └── vitest.config.ts               # Unit test configuration
├── frontend/                          # React + Vite Web Application
│   ├── src/
│   │   ├── components/                # UI components (Header, Canvas, Stats)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx          # Real-time vault & yield metrics
│   │   │   ├── Deposit.tsx            # FDC direct mint deposit workflow
│   │   │   ├── Withdraw.tsx           # ERC-4626 share redemption
│   │   │   └── Docs.tsx               # Interactive protocol documentation
│   │   ├── services/
│   │   │   ├── fdcClient.ts           # Flare Data Availability & Verifier client
│   │   │   └── fceClient.ts           # TEE signature verification client
│   │   └── config/contracts.ts        # Master deployed contract addresses
│   └── netlify.toml                   # Production hosting configuration
├── docs/                              # Comprehensive Technical Documentation
│   ├── 01-architecture/               # System architecture and flow diagrams
│   ├── 02-deployments/                # On-chain deployment records and checklists
│   ├── 03-strategies/                 # Strategy integration specifications
│   ├── 04-audit-and-diagnostics/      # Security audits and verification proofs
│   ├── 05-guides/                     # Testing and deployment runbooks
│   └── 06-fce-and-executor/           # TEE extension specifications
├── script/                            # Foundry deployment & operational scripts
├── test/                              # Smart contract Foundry test suites
├── foundry.toml                       # Foundry configuration
└── README.md                          # Master project documentation
```

---

## 🏆 Hackathon Track

### Track 1: Interoperable Asset Products
Flux delivers true cross-chain DeFi by integrating **Flare's FAssets system** with **Flare Data Connector (FDC)**:
- **Non-Custodial XRPL Deposits**: Users deposit raw native XRP on XRPL, which Flare validator consensus attests and mints into `FXRP` without third-party bridge trust.
- **Atomic ERC-4626 Vault Shares**: Directly settles into tokenized yield vaults in a single seamless user flow.

### Track 2: Flare Confidential Compute (FCC / FCE)
Flux implements the official **Flare Confidential Compute** specification:
- **TEE Strategy Routing**: Enclave execution prevents MEV sandwiching and public mempool front-running.
- **On-Chain Signature Verification**: `ParentVault` verifies the TEE's domain-separated EIP-191 signature before any rebalance is executed.
- **Liveness & Safety Mechanisms**: Features 10-minute TWAP protection, same-strategy capital compounding, and emergency fallback exits.

---

## 📋 Third-Party Disclosures

| Dependency | Purpose | License |
|---|---|---|
| [OpenZeppelin Contracts Upgradeable](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable) | ERC-4626 and proxy security primitives | MIT |
| [Foundry](https://github.com/foundry-rs/foundry) | Smart contract testing and deployment framework | Apache-2.0 / MIT |
| [Viem](https://viem.sh/) | TypeScript interface for Ethereum and Flare contracts | MIT |
| [Wagmi](https://wagmi.sh/) | React hooks for Web3 wallet connectivity | MIT |
| [React](https://react.dev/) | Frontend component framework | MIT |
| [Vite](https://vitejs.dev/) | High-performance frontend build tooling | MIT |
| [Tailwind CSS](https://tailwindcss.com/) | Responsive styling framework | MIT |
| [Framer Motion](https://www.framer.com/motion/) | Smooth UI animations and micro-interactions | MIT |
| [Vitest](https://vitest.dev/) | Fast TypeScript unit testing for TEE extension | MIT |

---

## 📜 License

MIT License. See [`LICENSE`](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Flare Network](https://flare.network) — For groundbreaking native oracle (FTSO), cross-chain consensus (FDC), and confidential compute (FCC) protocols.
- [XRPL Foundation](https://xrpl.org) — For fast, institutional-grade payment infrastructure.
- [OpenZeppelin](https://openzeppelin.com) — For battle-tested smart contract and ERC-4626 security standards.

---

**Built with ⚡ for the Flare Network Hackathon**

*Unlocking autonomous, cross-chain DeFi yield with cryptographic proof.*
