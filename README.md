# ⚡ Flux: Multi-Vault Yield Aggregator & Rebalance Engine

[![Flare Coston2](https://img.shields.io/badge/Network-Flare%20Coston2%20Testnet-red)](https://coston2-explorer.flare.network/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)](https://soliditylang.org/)
[![ERC-4626](https://img.shields.io/badge/Vault-ERC--4626%20Upgradeable-green)](https://eips.ethereum.org/EIPS/eip-4626)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

**Flux** is an autonomous, multi-vault yield aggregation platform built for the **Flare Network**. When users deposit verified underlying assets (`FXRP` or `CDP`), the protocol mints **Flux Coins** (receipt tokens representing shares in auto-compounding vaults). Flux combines **ERC-4626 yield vaults**, **FDC-verified FAssets direct minting**, **FTSO v2 oracle delegation**, and **Flare Confidential Compute (FCC / TEE) signed rebalancing** into a unified DeFi protocol.

---

## 🎯 Key Features & Hackathon Tracks

### Track 1: Interoperable Asset Products
* **FDC-verified FAsset Direct Minting:** XRPL $\rightarrow$ FDC proof $\rightarrow$ FXRP $\rightarrow$ atomic vault deposit, verified by Flare's AssetManager with no watcher or operator credit path.
* **Multi-Vault ERC-4626 Architecture:** Separate vaults tailored to specific underlying assets (`ParentVault_FXRP` & `ParentVault_CDP`).
* **Multi-Protocol Yield Generation:** FTSO v2 oracle delegation rewards (3–8% APY), SparkDEX V2 LP trading fees (5–15% APY), and Enosys V3 Concentrated Liquidity (8–20% APY).

### Track 2: Flare Confidential Compute (FCC / FCE)
* **Off-Chain TEE Rebalancing Engine:** Off-chain strategy evaluation producing FCC action results, authenticated with the TEE's domain-separated EIP-191 signature, for flash-loan-resistant, MEV-protected rebalancing.
* **InstructionSender Integration:** Standardized `IInstructionSender.sendInstructions()` on-chain trigger matching Flare's official FCE specification.
* **TWAP Oracle Protection:** 600-second (10-minute) TWAP pricing via `observe()` ticks to eliminate spot price manipulation.
* **7-Day Liveness Fallback:** On-chain `forceWithdrawAll()` emergency exit if off-chain TEE becomes unresponsive.

---

## 🏛️ System Architecture

```
                                  ┌─────────────────────────────────────────┐
                                  │           Flux Multi-Vault System       │
                                  └─────────────────────────────────────────┘
                                               │               │
                     ┌─────────────────────────┘               └────────────────────────┐
                     ▼                                                                  ▼
        ┌───────────────────────┐                                          ┌───────────────────────┐
        │ Vault 1: ParentVault  │                                          │ Vault 2: ParentVault  │
        │   Underlying: FXRP    │                                          │    Underlying: CDP    │
        │ Receipt: Flux Coin    │                                          │ Receipt: Flux Coin    │
        └───────────────────────┘                                          └───────────────────────┘
             │             │                                                           │
             ▼             ▼                                                           ▼
        ┌───────────┐ ┌───────────┐                                                ┌───────────────────────┐
        │  FTSO v2  │ │ SparkDEX  │                                                │ EnosysStrategyAdapter │
        │ Delegation│ │ LP (v2)   │                                                │ (CDP/WC2FLR DEX V3 LP)│
        └───────────┘ └───────────┘                                                └───────────────────────┘
```

---

## ⚙️ Dual-Tier Execution Infrastructure

Flux uses Flare's protocol-native verification layers for separate jobs:

| Tier | Component | Responsibilities | Security Model |
|---|---|---|---|
| **FDC / FAssets** | **`FdcDirectMintAdapter`** | Requests and relays an FDC `XRPPayment` Merkle proof to the live FAssets AssetManager, then atomically deposits verified net FXRP into the vault. | The AssetManager verifies the underlying payment proof on-chain; no watcher or operator balance can credit a deposit. |
| **FCC** | **`fce-extension/`** | TEE-enclave secure computation server that evaluates approved strategy routes and signs FCC action results for `teeAddress` verification. | Enclave-isolated key security for confidential strategy/rebalance decisions. |

---

## 📊 Master On-Chain Deployments (Flare Coston2 Testnet - Chain ID: 114)

| Component / Vault | On-Chain Address / ID (Coston2) | Underlying Asset / Role | Status |
|---|---|---|---|
| **`ParentVault_FXRP`** | `0x01f64160E4928Eba5607aE294F9B66090Dc323B3` | `FTestXRP` (`0x0b6A...3dc7`) | ✅ **LIVE & UPGRADED** |
| **`FdcDirectMintAdapter`** | `0xDd305DEe5a175575C74c62FC74065efb57e06ace` | FDC `XRPPayment` proof → atomic FXRP vault deposit | ✅ **LIVE & WIRED** |
| **`ParentVault_CDP`** | `0x71cF7B0f792400a2533e917bcfB3892b34b569e8` | `Enosys CDP` (`0x41D5...059`) | ✅ **LIVE & UPGRADED** |
| **`InstructionSender`** | `0x94A838fb58B226b0EB01Fa8DdE3758806AcE1Ba7` | Production Instruction Sender | ✅ **ACTIVE & WIRED** |
| **Extension ID** | `66166` (`0x...10276`) | Registered FCE Extension | ✅ **ON-CHAIN REGISTERED** |
| **TEE Machine** | `0xda05085B0c7c6Fad7a657c189e91a50c12d74210` | Active TEE Node | ✅ **PRODUCTION (Status 2)** |
| **`FtsoV2DelegationAdapter`** | `0xc529Eb4a03EC14E58598D03058DBb43B75059851` | `FXRP` $\rightarrow$ `WNAT` | ✅ **APPROVED (Vault 1)** |
| **`SparkDexAdapter`** | `0xA88327A42267C0dE171CBECA1b016dEF2e990612` | `FXRP / WC2FLR` LP | ✅ **APPROVED (Vault 1)** |
| **`EnosysCdpAdapter`** | `0x276BBc877C3d50e50848E7ca8c68241D959F4800` | `CDP / WC2FLR` V3 LP | ✅ **APPROVED (Vault 2)** |
| **`WNat / WC2FLR`** | `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273` | Native Wrapped Token | ✅ Active |
| **`FlareContractRegistry`** | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` | System Registry | ✅ Active |

> [!NOTE]
> **Attestation Mode Disclosure**: The off-chain FCE extension runs on Coston2 testnet under Flare's official **Simulated TEE Attestation Mode (`SIMULATED_TEE=true`)**. This executes the full FCE protocol—including instruction parsing, proxy-enclave queue routing, signing policies, and EIP-191 action-result signing—without dedicated GCP Confidential VM hardware. It is a testnet demonstration, not a hardware-attested mainnet deployment.


---

## 📁 Documentation Index (`docs/`)

All project documentation is organized chronologically under the `docs/` directory:

```
docs/
├── 01-architecture/
│   ├── 01-platform-overview.md
│   ├── 02-multi-vault-architecture.md
│   ├── 03-fasset-direct-minting.md
│   └── 04-tee-rebalance-engine.md
├── 02-deployments/
│   ├── 04-coston2-fcc-redeploy-status.md
│   ├── 05-deployment-checklist.md
│   ├── 06-phase1-complete.md
│   ├── 07-phase1-hash-verification.md
│   ├── 08-phase1-status.md
│   ├── 09-phase1-todo.md
│   ├── 10-phase2-complete.md
│   ├── 11-phase2-deployment-guide.md
│   ├── 12-phase2-phase3-deployed.md
│   ├── 13-phase3-complete.md
│   └── 14-system-wired-complete.md
├── 03-strategies/
│   └── (Yield strategy integration details)
├── 04-audit-and-diagnostics/
│   ├── 05-corrections-summary.md
│   ├── 06-critical-blockers-fce.md
│   ├── 07-honest-status.md
│   ├── 08-honest-system-status.md
│   └── 09-proof-of-work.md
├── 05-guides/
│   ├── 02-db-credentials-request.md
│   ├── 03-phase3-quick-start.md
│   ├── 04-phase3-registration-guide.md
│   └── 05-phase5-e2e-testing.md
└── 06-fce-and-executor/
    ├── 01-executor-migration.md
    ├── 02-fce-bugs-fixed.md
    ├── 03-fce-implementation-complete.md
    ├── 04-fce-integration-action-plan.md
    ├── 05-fce-integration-reality-check.md
    ├── 06-fce-integration-status.md
    └── 07-fce-technical-reference-corrected.md
```

---

## 🛠️ Verification & Testing

### 1. Smart Contract Compilation & Unit Tests (Foundry)
```bash
# Compile smart contracts
forge build

# Run smart contract unit tests
forge test
```

### 2. FCE Extension Unit Tests (Vitest)
```bash
cd fce-extension
npm test
# Result: 35 / 35 tests passed
```

### 3. Coston2 Testnet On-Chain Verification
```bash
source .env

# Verify ParentVault FXRP Vault Balance
cast call 0x01f64160E4928Eba5607aE294F9B66090Dc323B3 "totalAssets()(uint256)" --rpc-url $COSTON2_RPC_URL

# Rebalance Request Transaction Proof
# Tx Hash: 0xa2a2341d231107f0596f974d79fb3b2223da9f1034d811aff00c3c22e9001220
```

---

## 📜 License

MIT License. See [`LICENSE`](LICENSE) for details.
