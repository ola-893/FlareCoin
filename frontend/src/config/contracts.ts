/**
 * FlareYield Smart Contract Addresses
 * 
 * Multi-Vault Architecture:
 * - FXRP Vault: For XRP holders wanting growth + yield
 * - CDP Vault: For stablecoin holders wanting stable yield
 * 
 * Deployed on Flare Coston2 Testnet
 * Chain ID: 114
 */

export const COSTON2_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 114;

/**
 * Core FlareYield Protocol Contracts - Multi-Vault Architecture
 */
/**
 * FCE (Flare Compute Extension) Configuration
 * TEE extension for autonomous vault rebalancing
 */
export const FCE_CONFIG = {
  // FCE extension HTTP endpoint (for rebalance signing)
  endpoint: import.meta.env.VITE_FCE_ENDPOINT || 'http://localhost:8080',
  // Operation types matching fce-extension/src/app/config.ts
  opType: 'VAULT_REBALANCE',
  opCommand: 'CALCULATE_OPTIMAL',
} as const;

export const CONTRACTS = {
  // === FXRP Vault (Growth-Oriented) ===
  vaults: {
    // ParentVault_FXRP - ERC-4626 vault (proxy) for FXRP
    fxrpVault: import.meta.env.VITE_FXRP_VAULT_ADDRESS || '0x01f64160E4928Eba5607aE294F9B66090Dc323B3',
    
    // ParentVault_CDP - ERC-4626 vault (proxy) for CDP stablecoin
    cdpVault: import.meta.env.VITE_CDP_VAULT_ADDRESS || '0x71cF7B0f792400a2533e917bcfB3892b34b569e8',
  },
  
  // === Strategy Adapters ===
  strategies: {
    // FXRP Vault Strategies
    ftsoV2Delegation: import.meta.env.VITE_FTSO_ADAPTER_ADDRESS || '0xa0811A54F72Fd3e7b0F30d75227741feFE2755fB',
    sparkDexLp: import.meta.env.VITE_SPARKDEX_ADAPTER_ADDRESS || '0xA88327A42267C0dE171CBECA1b016dEF2e990612',
    smartAccountDirectMint: import.meta.env.VITE_SMART_ACCOUNT_ADAPTER_ADDRESS || '0xE0395E7B9Ac8B39463b85a8B20D93c2429F7D4Aa',
    enosysFxrp: import.meta.env.VITE_ENOSYS_FXRP_ADAPTER_ADDRESS || '0x5A839334A11983b958a7C70a8822783db6Be4bf6',
    
    // CDP Vault Strategies
    enosysCdpLp: import.meta.env.VITE_ENOSYS_CDP_ADAPTER_ADDRESS || '0x276BBc877C3d50e50848E7ca8c68241D959F4800',
  },
  
  // === Legacy / Backward Compatibility ===
  // @deprecated Use vaults.fxrpVault instead
  parentVault: import.meta.env.VITE_PARENT_VAULT_ADDRESS || '0x01f64160E4928Eba5607aE294F9B66090Dc323B3',
  
  // FAssetAdapter - Direct minting integration
  fAssetAdapter: import.meta.env.VITE_FASSET_ADAPTER_ADDRESS || '0x02D4F85301A2d1b3Bcc40BfD7937e6Fb2F5224a7',
  
  // FCE (Flare Compute Extension) - InstructionSender
  instructionSender: import.meta.env.VITE_INSTRUCTION_SENDER_ADDRESS || '0xCaCFdd034D05419e2F5572E4F4170bd26caD05B7',
  
  // === Underlying Assets ===
  tokens: {
    // FXRP Token (Flare-wrapped XRP)
    fxrp: import.meta.env.VITE_FXRP_ADDRESS || '0x0b6A3645c240605887a5532109323A3E12273dc7',
    
    // CDP Token (Enosys CDP Dollar - XRP-backed stablecoin)
    cdp: import.meta.env.VITE_CDP_ADDRESS || '0x41D503D78D319D685fb9311363732009f7224059',
    
    // WC2FLR / WNat (Wrapped Flare)
    wc2flr: import.meta.env.VITE_WC2FLR_ADDRESS || '0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273',
  },
  
  // === Legacy Token References ===
  // @deprecated Use tokens.fxrp instead
  fxrp: import.meta.env.VITE_FXRP_ADDRESS || '0x0b6A3645c240605887a5532109323A3E12273dc7',
  
  // === Flare FAsset Infrastructure ===
  assetManagerFXRP: import.meta.env.VITE_ASSET_MANAGER_FXRP_ADDRESS || '0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA',
  mintingTagManager: import.meta.env.VITE_MINTING_TAG_MANAGER_ADDRESS || '0x094511737909b626391106bBc21B25feb2D67B96',
} as const;

/**
 * Contract ABIs
 * Import from generated files or define minimal ABIs here
 */

// ParentVault (ERC-4626) minimal ABI — object format for viem compatibility
export const PARENT_VAULT_ABI = [
  // ERC-4626 Standard
  {type:'function',name:'asset',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'totalAssets',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'totalSupply',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'convertToShares',stateMutability:'view',inputs:[{name:'assets',type:'uint256'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'convertToAssets',stateMutability:'view',inputs:[{name:'shares',type:'uint256'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'maxDeposit',stateMutability:'view',inputs:[{name:'',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'maxMint',stateMutability:'view',inputs:[{name:'',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'maxWithdraw',stateMutability:'view',inputs:[{name:'owner',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'maxRedeem',stateMutability:'view',inputs:[{name:'owner',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'previewDeposit',stateMutability:'view',inputs:[{name:'assets',type:'uint256'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'previewMint',stateMutability:'view',inputs:[{name:'shares',type:'uint256'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'previewWithdraw',stateMutability:'view',inputs:[{name:'assets',type:'uint256'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'previewRedeem',stateMutability:'view',inputs:[{name:'shares',type:'uint256'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'deposit',stateMutability:'nonpayable',inputs:[{name:'assets',type:'uint256'},{name:'receiver',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'mint',stateMutability:'nonpayable',inputs:[{name:'shares',type:'uint256'},{name:'receiver',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'withdraw',stateMutability:'nonpayable',inputs:[{name:'assets',type:'uint256'},{name:'receiver',type:'address'},{name:'owner',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'redeem',stateMutability:'nonpayable',inputs:[{name:'shares',type:'uint256'},{name:'receiver',type:'address'},{name:'owner',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  // ERC-20 (shares)
  {type:'function',name:'name',stateMutability:'view',inputs:[],outputs:[{name:'',type:'string'}]},
  {type:'function',name:'symbol',stateMutability:'view',inputs:[],outputs:[{name:'',type:'string'}]},
  {type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint8'}]},
  {type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
  {type:'function',name:'allowance',stateMutability:'view',inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'transfer',stateMutability:'nonpayable',inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
  {type:'function',name:'transferFrom',stateMutability:'nonpayable',inputs:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
  // FlareYield specific
  {type:'function',name:'activeStrategy',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'fAssetAdapter',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'totalPendingFAssetDeposits',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'pendingFAssetDeposits',stateMutability:'view',inputs:[{name:'depositId',type:'bytes32'}],outputs:[{name:'receiver',type:'address'},{name:'queuedAt',type:'uint256'}]},
  {type:'function',name:'teeLastActive',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'rebalanceNonce',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'liquidityBufferBps',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint16'}]},
  {type:'function',name:'fccSigner',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  // FCE Integration
  {type:'function',name:'teeAddress',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'instructionSender',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'rebalanceThreshold',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'lastInstructionId',stateMutability:'view',inputs:[],outputs:[{name:'',type:'bytes32'}]},
  {type:'function',name:'requestRebalance',stateMutability:'nonpayable',inputs:[],outputs:[]},
  {type:'function',name:'executeRebalance',stateMutability:'nonpayable',inputs:[{name:'resultData',type:'bytes'},{name:'actionId',type:'bytes32'},{name:'submissionTag',type:'string'},{name:'status',type:'uint8'},{name:'signature',type:'bytes'}],outputs:[]},
  // Events
  {type:'event',name:'Deposit',inputs:[{name:'sender',type:'address',indexed:true},{name:'owner',type:'address',indexed:true},{name:'assets',type:'uint256',indexed:false},{name:'shares',type:'uint256',indexed:false}]},
  {type:'event',name:'Withdraw',inputs:[{name:'sender',type:'address',indexed:true},{name:'receiver',type:'address',indexed:true},{name:'owner',type:'address',indexed:true},{name:'assets',type:'uint256',indexed:false},{name:'shares',type:'uint256',indexed:false}]},
  {type:'event',name:'FAssetDepositQueued',inputs:[{name:'depositId',type:'bytes32',indexed:true},{name:'receiver',type:'address',indexed:true}]},
  {type:'event',name:'FAssetDepositSettled',inputs:[{name:'depositId',type:'bytes32',indexed:true},{name:'receiver',type:'address',indexed:true},{name:'assets',type:'uint256',indexed:false},{name:'shares',type:'uint256',indexed:false}]},
] as const;

// FAssetAdapter minimal ABI — object format for viem compatibility
export const FASSET_ADAPTER_ABI = [
  {type:'function',name:'vault',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'fAsset',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'mintingTagManager',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'defaultDirectMintExecutor',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'registerMintingTag',stateMutability:'payable',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'tagUser',stateMutability:'view',inputs:[{name:'tag',type:'uint256'}],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'tagExecutor',stateMutability:'view',inputs:[{name:'tag',type:'uint256'}],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'processDirectMint',stateMutability:'nonpayable',inputs:[{name:'tag',type:'uint256'},{name:'depositId',type:'bytes32'},{name:'observedMintedAmount',type:'uint256'}],outputs:[]},
  {type:'function',name:'settleDirectMint',stateMutability:'nonpayable',inputs:[{name:'depositId',type:'bytes32'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'pendingDirectMints',stateMutability:'view',inputs:[{name:'depositId',type:'bytes32'}],outputs:[{name:'receiver',type:'address'},{name:'tag',type:'uint256'},{name:'assets',type:'uint256'}]},
  {type:'function',name:'setTagExecutor',stateMutability:'nonpayable',inputs:[{name:'tag',type:'uint256'},{name:'newExecutor',type:'address'}],outputs:[]},
  {type:'function',name:'pendingDepositForTag',stateMutability:'view',inputs:[{name:'tag',type:'uint256'}],outputs:[{name:'',type:'bytes32'}]},
  // Events
  {type:'event',name:'MintingTagRegistered',inputs:[{name:'tag',type:'uint256',indexed:true},{name:'user',type:'address',indexed:true},{name:'executor',type:'address',indexed:true}]},
  {type:'event',name:'DirectMintProcessed',inputs:[{name:'depositId',type:'bytes32',indexed:true},{name:'tag',type:'uint256',indexed:true},{name:'receiver',type:'address',indexed:true},{name:'postFeeAssets',type:'uint256',indexed:false}]},
  {type:'event',name:'DirectMintSettled',inputs:[{name:'depositId',type:'bytes32',indexed:true},{name:'receiver',type:'address',indexed:true},{name:'assets',type:'uint256',indexed:false},{name:'shares',type:'uint256',indexed:false}]},
] as const;

// FXRP (ERC-20) minimal ABI — object format for viem compatibility
export const FXRP_ABI = [
  {type:'function',name:'name',stateMutability:'view',inputs:[],outputs:[{name:'',type:'string'}]},
  {type:'function',name:'symbol',stateMutability:'view',inputs:[],outputs:[{name:'',type:'string'}]},
  {type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint8'}]},
  {type:'function',name:'totalSupply',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'transfer',stateMutability:'nonpayable',inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
  {type:'function',name:'allowance',stateMutability:'view',inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
  {type:'function',name:'transferFrom',stateMutability:'nonpayable',inputs:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
  // Events
  {type:'event',name:'Transfer',inputs:[{name:'from',type:'address',indexed:true},{name:'to',type:'address',indexed:true},{name:'value',type:'uint256',indexed:false}]},
  {type:'event',name:'Approval',inputs:[{name:'owner',type:'address',indexed:true},{name:'spender',type:'address',indexed:true},{name:'value',type:'uint256',indexed:false}]},
] as const;

// AssetManager ABI (for fetching Core Vault XRPL address)
export const ASSET_MANAGER_ABI = [
  {
    name: 'directMintingPaymentAddress',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{name: '', type: 'string'}],
  },
] as const;

// MintingTagManager minimal ABI — object format for viem compatibility
export const MINTING_TAG_MANAGER_ABI = [
  {type:'function',name:'reservationFee',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'nextAvailableTag',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'mintingRecipient',stateMutability:'view',inputs:[{name:'tag',type:'uint256'}],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'allowedExecutor',stateMutability:'view',inputs:[{name:'tag',type:'uint256'}],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'reservedTagsForOwner',stateMutability:'view',inputs:[{name:'owner',type:'address'}],outputs:[{name:'',type:'uint256[]'}]},
] as const;

// StrategyAdapter minimal ABI
export const STRATEGY_ADAPTER_ABI = [
  {type:'function',name:'totalValue',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'vault',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
  {type:'function',name:'underlyingAsset',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
] as const;

/**
 * Explorer URLs
 */
export const EXPLORER_BASE_URL = import.meta.env.VITE_EXPLORER_URL || 'https://coston2-explorer.flare.network';

export const getExplorerUrl = (address: string, type: 'address' | 'tx' = 'address') => {
  return `${EXPLORER_BASE_URL}/${type}/${address}`;
};

/**
 * Helper to check if connected to correct network
 */
export const isCoston2 = (chainId: number | undefined) => {
  return chainId === COSTON2_CHAIN_ID;
};

/**
 * Human-readable contract names
 */
export const CONTRACT_NAMES = {
  // Vaults
  [CONTRACTS.vaults.fxrpVault]: 'Flux FXRP Vault (Flux Coin)',
  [CONTRACTS.vaults.cdpVault]: 'Flux CDP Vault (Flux Coin)',
  
  // Strategies
  [CONTRACTS.strategies.ftsoV2Delegation]: 'FTSO v2 Delegation Strategy',
  [CONTRACTS.strategies.sparkDexLp]: 'SparkDEX LP Strategy',
  [CONTRACTS.strategies.enosysCdpLp]: 'Enosys V3 CDP LP Strategy',
  
  // Legacy
  [CONTRACTS.parentVault]: 'Flux Vault (Legacy)',
  [CONTRACTS.fAssetAdapter]: 'FAsset Adapter',
  
  // Tokens
  [CONTRACTS.tokens.fxrp]: 'FXRP Token',
  [CONTRACTS.tokens.cdp]: 'CDP Dollar',
  [CONTRACTS.tokens.wc2flr]: 'Wrapped C2FLR',
  [CONTRACTS.fxrp]: 'FXRP Token (Legacy)',
  
  // Infrastructure
  [CONTRACTS.assetManagerFXRP]: 'Asset Manager FXRP',
  [CONTRACTS.mintingTagManager]: 'Minting Tag Manager',
} as const;

/**
 * Vault Metadata for UI
 */
export const VAULT_METADATA = {
  fxrp: {
    address: CONTRACTS.vaults.fxrpVault,
    name: 'FXRP Vault',
    symbol: 'Flux',
    description: 'Growth-oriented vault for XRP holders. Earn yield without selling your XRP.',
    underlyingAsset: CONTRACTS.tokens.fxrp,
    underlyingSymbol: 'FXRP',
    strategies: [
      {
        address: CONTRACTS.strategies.ftsoV2Delegation,
        name: 'FTSO v2 Delegation',
        apyRange: '3-8%',
        riskLevel: 'Low',
        status: 'Deployed',
      },
      {
        address: CONTRACTS.strategies.sparkDexLp,
        name: 'SparkDEX LP',
        apyRange: '5-15%',
        riskLevel: 'Medium',
        status: 'Deployed',
      },
      {
        address: CONTRACTS.strategies.smartAccountDirectMint,
        name: 'Smart Account Direct Mint',
        apyRange: '2-5%',
        riskLevel: 'Low',
        status: 'Deployed',
      },
      {
        address: CONTRACTS.strategies.enosysFxrp,
        name: 'Enosys DEX FXRP',
        apyRange: '8-14%',
        riskLevel: 'Medium',
        status: 'Deployed',
      },
    ],
    riskProfile: 'Medium' as const,
    targetApy: '5-12%',
  },
  cdp: {
    address: CONTRACTS.vaults.cdpVault,
    name: 'CDP Vault',
    symbol: 'fyCDP',
    description: 'Stable yield vault for CDP stablecoin holders. Predictable returns with lower volatility.',
    underlyingAsset: CONTRACTS.tokens.cdp,
    underlyingSymbol: 'CDP',
    strategies: [
      {
        address: CONTRACTS.strategies.enosysCdpLp,
        name: 'Enosys V3 LP',
        apyRange: '8-20%',
        riskLevel: 'Low-Medium',
      },
    ],
    riskProfile: 'Low' as const,
    targetApy: '8-20%',
  },
} as const;
