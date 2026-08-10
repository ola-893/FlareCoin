/**
 * FlareYield FCE Extension Configuration
 *
 * Operation types and commands for vault rebalancing
 */
/**
 * Operation Types and Commands (Plain Strings)
 *
 * Per FCE wire protocol (docs/extension-contract.md §4 & §5):
 * - Pass plain strings to framework.handle()
 * - Framework converts them to right-zero-padded bytes32 via stringToBytes32Hex()
 * - DO NOT pre-pad or hash these identifiers!
 *
 * Example: "GREETING" → Framework converts to:
 * 0x4752454554494e47000000000000000000000000000000000000000000000000
 */
// FlareYield operation types (will be padded by Framework)
export const OP_TYPE_VAULT_REBALANCE = "VAULT_REBALANCE";
export const OP_TYPE_STRATEGY_ANALYSIS = "STRATEGY_ANALYSIS";
// FlareYield operation commands (will be padded by Framework)
export const OP_COMMAND_CALCULATE_OPTIMAL = "CALCULATE_OPTIMAL";
export const OP_COMMAND_EXECUTE_REBALANCE = "EXECUTE_REBALANCE";
export const OP_COMMAND_GET_APYS = "GET_APYS";
// Network configuration
export const COSTON2_RPC_URL = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
// Contract addresses on Coston2
export const PARENT_VAULT_FXRP = "0x01f64160E4928Eba5607aE294F9B66090Dc323B3";
export const PARENT_VAULT_CDP = "0x71cF7B0f792400a2533e917bcfB3892b34b569e8";
// Strategy adapters
export const FTSO_ADAPTER = "0xa0811A54F72Fd3e7b0F30d75227741feFE2755fB";
export const SPARKDEX_ADAPTER = "0xA88327A42267C0dE171CBECA1b016dEF2e990612";
export const ENOSYS_CDP_ADAPTER = "0x276BBc877C3d50e50848E7ca8c68241D959F4800";
// Extension version
export const VERSION = "0.1.0";
// Rebalance thresholds
export const MIN_REBALANCE_AMOUNT = BigInt(1000); // 1000 wei for testnet flexibility
export const SLIPPAGE_TOLERANCE_BPS = 50; // 0.5%
export const MIN_TWAP_WINDOW = 24 * 60 * 60; // 24 hours in seconds
