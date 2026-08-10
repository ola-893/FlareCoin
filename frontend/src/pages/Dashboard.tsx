import React, {useState, useMemo} from 'react';
import {useAccount, useBalance, useReadContract} from 'wagmi';
import {useQueryClient} from '@tanstack/react-query';
import {formatUnits} from 'viem';
import {motion} from 'motion/react';
import {ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip} from 'recharts';
import {
  TrendingUp, Layers, ArrowUpRight, ArrowDownRight, Wallet, RefreshCw,
  Zap, ShieldCheck, Copy, Check, ChevronRight, ArrowRight, Cpu,
  Coins, Target, DollarSign, BarChart3, Info, ExternalLink
} from 'lucide-react';
import {CONTRACTS, PARENT_VAULT_ABI, STRATEGY_ADAPTER_ABI, EXPLORER_BASE_URL} from '../config/contracts';
import {StrategiesModal} from '../components/StrategiesModal';
import {useCryptoPrices, xrpToUsd, formatUsd} from '../hooks/useXrpPrice';

const FXRP_VAULT_ADDRESS: `0x${string}` = CONTRACTS.vaults.fxrpVault;
const CDP_VAULT_ADDRESS: `0x${string}` = CONTRACTS.vaults.cdpVault;

interface DashboardProps {
  onNavigateToDeposit: () => void;
  onNavigateToWithdraw: () => void;
}

// ─── Strategy Info Database ─────────────────────────────────────────────────
const STRATEGY_INFO: Record<string, {
  name: string;
  description: string;
  apy: string;
  apyLow: number;
  apyHigh: number;
  icon: string;
  riskLevel: string;
  protocol: string;
}> = {
  [CONTRACTS.strategies.ftsoV2Delegation]: {
    name: 'FTSO v2 Delegation',
    description: 'Earn by delegating to Flare oracle providers',
    apy: '3-8%',
    apyLow: 3,
    apyHigh: 8,
    icon: '🔮',
    riskLevel: 'Low',
    protocol: 'Flare Network',
  },
  [CONTRACTS.strategies.sparkDexLp]: {
    name: 'SparkDEX LP',
    description: 'Earn trading fees from SparkDEX liquidity pools',
    apy: '5-15%',
    apyLow: 5,
    apyHigh: 15,
    icon: '💎',
    riskLevel: 'Medium',
    protocol: 'SparkDEX',
  },
  [CONTRACTS.strategies.smartAccountDirectMint]: {
    name: 'Smart Account Direct Mint',
    description: 'Optimized FAsset minting rewards',
    apy: '2-5%',
    apyLow: 2,
    apyHigh: 5,
    icon: '⚡',
    riskLevel: 'Low',
    protocol: 'Flare FAssets',
  },
  [CONTRACTS.strategies.enosysFxrp]: {
    name: 'Enosys DEX FXRP',
    description: 'Earn fees from FXRP/USDC concentrated liquidity',
    apy: '8-14%',
    apyLow: 8,
    apyHigh: 14,
    icon: '🌊',
    riskLevel: 'Medium',
    protocol: 'Enosys DEX',
  },
  [CONTRACTS.strategies.enosysCdpLp]: {
    name: 'Enosys V3 CDP LP',
    description: 'Earn fees from CDP/WC2FLR concentrated liquidity',
    apy: '8-20%',
    apyLow: 8,
    apyHigh: 20,
    icon: '🏦',
    riskLevel: 'Low-Medium',
    protocol: 'Enosys DEX',
  },
};

const getDefaultStrategyInfo = (addr: string | undefined) => ({
  name: 'Awaiting Deployment',
  description: 'Deposit to activate yield generation',
  apy: 'N/A',
  apyLow: 0,
  apyHigh: 0,
  icon: '⏳',
  riskLevel: 'N/A',
  protocol: 'None',
});

// ─── Helper Functions ───────────────────────────────────────────────────────
const formatNumber = (n: number, decimals = 4): string => {
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toFixed(decimals);
};

// ─── Main Dashboard Component ───────────────────────────────────────────────
export const Dashboard: React.FC<DashboardProps> = ({onNavigateToDeposit, onNavigateToWithdraw}) => {
  const {address, isConnected} = useAccount();
  const {data: nativeBalance} = useBalance({address});
  const [copied, setCopied] = useState(false);
  const [showStrategiesModal, setShowStrategiesModal] = useState(false);
  const [projectionDays, setProjectionDays] = useState(30);
  const [showDebug, setShowDebug] = useState(false);

  // Fetch crypto prices for USD calculations
  const {xrp: xrpPriceData, btc: btcPriceData, cdp: cdpPriceData, isLoading: isPriceLoading} = useCryptoPrices();
  const xrpPrice = xrpPriceData.price;
  const xrpPriceChange = xrpPriceData.change24h;
  const btcPrice = btcPriceData.price;
  const btcPriceChange = btcPriceData.change24h;
  const cdpPrice = cdpPriceData.price;
  const cdpPriceChange = cdpPriceData.change24h;

  const isFxrpDeployed = FXRP_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const isCdpDeployed = CDP_VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  // ═══ FXRP Vault Reads ═══════════════════════════════════════════════════
  const {data: fxrpTotalAssets} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'totalAssets',
    query: {enabled: isFxrpDeployed},
  });

  const {data: fxrpTotalSupply} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'totalSupply',
    query: {enabled: isFxrpDeployed},
  });

  const {data: fxrpUserShares} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {enabled: isFxrpDeployed && !!address},
  });

  const {data: fxrpActiveStrategy} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'activeStrategy',
    query: {enabled: isFxrpDeployed},
  });

  const {data: fxrpDecimals} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'decimals',
    query: {enabled: isFxrpDeployed},
  });

  // FCE Integration reads
  const {data: fxrpInstructionSender} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'instructionSender',
    query: {enabled: isFxrpDeployed},
  });

  const {data: fxrpTeeAddress} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'teeAddress',
    query: {enabled: isFxrpDeployed},
  });

  const {data: fxrpRebalanceThreshold} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'rebalanceThreshold',
    query: {enabled: isFxrpDeployed},
  });

  const {data: fxrpLastInstructionId} = useReadContract({
    address: FXRP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'lastInstructionId',
    query: {enabled: isFxrpDeployed},
  });

  // Read strategy adapter's totalValue for yield calculation
  const {data: strategyTotalValue} = useReadContract({
    address: fxrpActiveStrategy as `0x${string}` | undefined,
    abi: STRATEGY_ADAPTER_ABI,
    functionName: 'totalValue',
    query: {enabled: isFxrpDeployed && !!fxrpActiveStrategy && fxrpActiveStrategy !== '0x0000000000000000000000000000000000000000'},
  });

  // Manual refresh: invalidate all cached queries to refetch on-chain data
  const queryClient = useQueryClient();
  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  // ═══ CDP Vault Reads ════════════════════════════════════════════════════
  const {data: cdpTotalAssets} = useReadContract({
    address: CDP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'totalAssets',
    query: {enabled: isCdpDeployed},
  });

  const {data: cdpTotalSupply} = useReadContract({
    address: CDP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'totalSupply',
    query: {enabled: isCdpDeployed},
  });

  const {data: cdpUserShares} = useReadContract({
    address: CDP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {enabled: isCdpDeployed && !!address},
  });

  const {data: cdpActiveStrategy} = useReadContract({
    address: CDP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'activeStrategy',
    query: {enabled: isCdpDeployed},
  });

  const {data: cdpDecimals} = useReadContract({
    address: CDP_VAULT_ADDRESS,
    abi: PARENT_VAULT_ABI,
    functionName: 'decimals',
    query: {enabled: isCdpDeployed},
  });

  // ═══ Calculations ═══════════════════════════════════════════════════════
  const decimals = fxrpDecimals ?? 18;
  const cdpDec = cdpDecimals ?? 18;

  // FXRP Vault calculations
  const fxrpTotalAssetsNum = fxrpTotalAssets ? Number(formatUnits(fxrpTotalAssets, decimals)) : 0;
  const fxrpTotalSupplyNum = fxrpTotalSupply ? Number(formatUnits(fxrpTotalSupply, decimals)) : 0;
  const fxrpUserSharesNum = fxrpUserShares ? Number(formatUnits(fxrpUserShares, decimals)) : 0;
  
  // Share price: if totalSupply > 0, use actual ratio; otherwise default to 1
  const fxrpSharePrice = fxrpTotalSupplyNum > 0 ? fxrpTotalAssetsNum / fxrpTotalSupplyNum : 1;
  
  // User value: shares × share price
  // If totalAssets is 0 but user has shares, assume 1:1 ratio (shares = assets)
  const fxrpUserValue = fxrpUserSharesNum > 0 
    ? (fxrpTotalAssetsNum > 0 ? fxrpUserSharesNum * fxrpSharePrice : fxrpUserSharesNum)
    : 0;
  
  const fxrpHasActiveStrategy = fxrpActiveStrategy && fxrpActiveStrategy !== '0x0000000000000000000000000000000000000000';
  const fxrpStrategyInfo = fxrpHasActiveStrategy ? STRATEGY_INFO[fxrpActiveStrategy as string] ?? getDefaultStrategyInfo(fxrpActiveStrategy as string) : getDefaultStrategyInfo(undefined);

  // Individual (per-account) deployment: the strategy holds the vault's pooled
  // capital, so a user's personal deployed amount = their value × the vault's
  // deployment ratio (strategy totalValue ÷ vault totalAssets).
  const fxrpStrategyValueNum = strategyTotalValue ? Number(formatUnits(strategyTotalValue, decimals)) : 0;
  const fxrpDeployRatio = fxrpTotalAssetsNum > 0 && fxrpStrategyValueNum > 0
    ? Math.min(fxrpStrategyValueNum / fxrpTotalAssetsNum, 1)
    : 0.9;
  const fxrpUserSharePct = fxrpTotalSupplyNum > 0 ? (fxrpUserSharesNum / fxrpTotalSupplyNum) * 100 : 0;
  const fxrpUserDeployed = fxrpUserValue * fxrpDeployRatio;

  // Debug: Log calculated values only when the debug panel is open
  if (showDebug) {
    console.log('[Dashboard Debug] Contract reads:', {
      fxrpUserShares: fxrpUserShares?.toString(),
      fxrpTotalAssets: fxrpTotalAssets?.toString(),
      fxrpTotalSupply: fxrpTotalSupply?.toString(),
      fxrpActiveStrategy,
      decimals,
      address,
    });
    console.log('[Dashboard Debug] Calculated:', {
      fxrpUserSharesNum,
      fxrpTotalAssetsNum,
      fxrpTotalSupplyNum,
      fxrpSharePrice,
      fxrpUserValue,
    });
  }

  // Calculate yield metrics
  // If share price > 1, yield has been accrued
  // Accrued yield = userValue - (userShares * 1.0) assuming 1:1 deposit
  const fxrpAccruedYield = fxrpUserSharesNum > 0 ? fxrpUserValue - fxrpUserSharesNum : 0;

  // Projected yield calculations (using mid-point APY)
  const estimatedApy = fxrpHasActiveStrategy ? (fxrpStrategyInfo.apyLow + fxrpStrategyInfo.apyHigh) / 2 / 100 : 0;
  const dailyYield = fxrpUserValue * estimatedApy / 365;
  const yearlyYield = fxrpUserValue * estimatedApy;

  // Projection chart data
  const projectionData = useMemo(() => {
    const data = [];
    const days = projectionDays;
    for (let i = 0; i <= days; i += Math.max(1, Math.floor(days / 30))) {
      const projectedValue = fxrpUserValue * Math.pow(1 + estimatedApy / 365, i);
      data.push({
        day: i,
        label: i === 0 ? 'Today' : `Day ${i}`,
        value: Number(projectedValue.toFixed(4)),
        yield: Number((projectedValue - fxrpUserValue).toFixed(4)),
      });
    }
    // Always include the final day
    if (data[data.length - 1]?.day !== days) {
      const projectedValue = fxrpUserValue * Math.pow(1 + estimatedApy / 365, days);
      data.push({
        day: days,
        label: `Day ${days}`,
        value: Number(projectedValue.toFixed(4)),
        yield: Number((projectedValue - fxrpUserValue).toFixed(4)),
      });
    }
    return data;
  }, [fxrpUserValue, estimatedApy, projectionDays]);

  // CDP Vault calculations
  const cdpTotalAssetsNum = cdpTotalAssets ? Number(formatUnits(cdpTotalAssets, cdpDec)) : 0;
  const cdpTotalSupplyNum = cdpTotalSupply ? Number(formatUnits(cdpTotalSupply, cdpDec)) : 0;
  const cdpUserSharesNum = cdpUserShares ? Number(formatUnits(cdpUserShares, cdpDec)) : 0;
  const cdpSharePrice = cdpTotalSupplyNum > 0 ? cdpTotalAssetsNum / cdpTotalSupplyNum : 1;
  const cdpUserValue = cdpUserSharesNum * cdpSharePrice;
  const cdpActiveStr = cdpActiveStrategy as string | undefined;
  const cdpKnownStrategyInfo = cdpActiveStr ? STRATEGY_INFO[cdpActiveStr] : undefined;
  // Badge shows "Active" only when the on-chain strategy is recognized; otherwise
  // the vault is deployed but awaiting deployment ("Ready").
  const cdpHasActiveStrategy = !!cdpKnownStrategyInfo;
  // Fall back to the configured CDP strategy (Enosys V3 CDP LP) so the card always
  // shows real product info even when activeStrategy is unset or a placeholder.
  const cdpStrategyInfo = cdpKnownStrategyInfo
    ?? STRATEGY_INFO[CONTRACTS.strategies.enosysCdpLp]
    ?? getDefaultStrategyInfo(cdpActiveStr);

  // Combined pool size across both vaults (FXRP ≈ XRP price, CDP ≈ $1 peg —
  // close enough that the summed USD is a fair approximation).
  const combinedTotalAssets = fxrpTotalAssetsNum + cdpTotalAssetsNum;

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ═══ Not Connected State ════════════════════════════════════════════════
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F5F3] flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{opacity: 0, y: 30}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.6, ease: [0.16, 1, 0.3, 1]}}
        >
          <div className="stat-icon-ring mx-auto mb-6" style={{width: 64, height: 64, borderRadius: 20}}>
            <Wallet className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-[#1E1E1E]/20 text-[10px] font-mono font-bold text-[#1E1E1E] uppercase tracking-[0.2em] mb-4 bg-white/40">
            <Wallet className="w-3.5 h-3.5 text-[#E1BAC2]" />
            <span>GET STARTED</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E1E1E] mb-3" style={{fontFamily: 'Manrope, sans-serif'}}>
            Connect your wallet
          </h2>
          <p className="text-sm text-[#4A4A4A] max-w-sm mx-auto" style={{fontFamily: 'Hanken Grotesk, sans-serif'}}>
            Connect to view your Flux portfolio and start earning automatic yield
          </p>
        </motion.div>
      </div>
    );
  }

  // ═══ Main Dashboard ══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F5F5F3] pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ─── Welcome Header ─── */}
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.5, ease: [0.16, 1, 0.3, 1]}}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1E1E1E] leading-tight" style={{fontFamily: 'Manrope, sans-serif'}}>
                Portfolio
              </h1>
              <button onClick={copyAddress} className="flex items-center gap-2 mt-2 group">
                <span className="text-sm font-mono text-[#4A4A4A]">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#4A4A4A]/50 group-hover:text-[#E1BAC2] transition-colors" />
                )}
                <ExternalLink className="w-3 h-3 text-[#4A4A4A]/30" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 border border-[#1E1E1E]/10 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-[#4A4A4A]">
                  Coston2
                </span>
              </div>
              <button
                onClick={handleRefresh}
                className="p-2 rounded-full bg-white/60 border border-[#1E1E1E]/10 hover:bg-white/90 transition-all"
                title="Refresh contract data"
              >
                <RefreshCw className="w-4 h-4 text-[#4A4A4A]" />
              </button>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="p-2 rounded-full bg-white/60 border border-[#1E1E1E]/10 hover:bg-white/90 transition-all"
                title="Toggle debug info"
              >
                <Info className="w-4 h-4 text-[#4A4A4A]" />
              </button>
              <button
                onClick={onNavigateToDeposit}
                className="px-4 py-2 rounded-full bg-[#1E1E1E] text-[#E1BAC2] text-[11px] font-bold uppercase tracking-[0.12em] hover:bg-[#000000] transition-all shadow-md flex items-center gap-2"
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                Deposit
              </button>
            </div>
          </div>
          <div className="flux-divider mt-6">
            <div className="flux-divider-diamond" />
          </div>
        </motion.div>

        {/* ═══ Debug Panel ═══ */}
        {showDebug && (
          <motion.div
            initial={{opacity: 0, height: 0}}
            animate={{opacity: 1, height: 'auto'}}
            exit={{opacity: 0, height: 0}}
            className="mb-6 p-4 rounded-2xl bg-[#1E1E1E] text-white font-mono text-[10px] overflow-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-[#E1BAC2]">Debug: Contract Reads</h4>
              <button onClick={handleRefresh} className="flex items-center gap-1 text-[#E1BAC2] hover:text-white">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-white/60 mb-1">FXRP Vault ({FXRP_VAULT_ADDRESS.slice(0, 8)}...)</p>
                <p>User Shares: <span className="text-[#E1BAC2]">{fxrpUserShares?.toString() ?? 'undefined'}</span></p>
                <p>Total Assets: <span className="text-[#E1BAC2]">{fxrpTotalAssets?.toString() ?? 'undefined'}</span></p>
                <p>Total Supply: <span className="text-[#E1BAC2]">{fxrpTotalSupply?.toString() ?? 'undefined'}</span></p>
                <p>Active Strategy: <span className="text-[#E1BAC2]">{fxrpActiveStrategy ?? 'undefined'}</span></p>
                <p>Decimals: <span className="text-[#E1BAC2]">{fxrpDecimals?.toString() ?? 'undefined'}</span></p>
                <p>Connected: <span className="text-[#E1BAC2]">{address ?? 'none'}</span></p>
                <p className="mt-2 text-white/60">FCE Integration</p>
                <p>Instruction Sender: <span className="text-[#E1BAC2]">{fxrpInstructionSender ? `${(fxrpInstructionSender as string).slice(0, 8)}...` : 'not set'}</span></p>
                <p>TEE Address: <span className="text-[#E1BAC2]">{fxrpTeeAddress ? `${(fxrpTeeAddress as string).slice(0, 8)}...` : 'not set'}</span></p>
                <p>Rebalance Threshold: <span className="text-[#E1BAC2]">{fxrpRebalanceThreshold?.toString() ?? '0'}</span></p>
                <p>Last Instruction: <span className="text-[#E1BAC2]">{fxrpLastInstructionId ? `${(fxrpLastInstructionId as string).slice(0, 10)}...` : 'none'}</span></p>
              </div>
              <div>
                <p className="text-white/60 mb-1">Calculated Values</p>
                <p>User Shares (num): <span className="text-[#E1BAC2]">{fxrpUserSharesNum}</span></p>
                <p>Total Assets (num): <span className="text-[#E1BAC2]">{fxrpTotalAssetsNum}</span></p>
                <p>Total Supply (num): <span className="text-[#E1BAC2]">{fxrpTotalSupplyNum}</span></p>
                <p>Share Price: <span className="text-[#E1BAC2]">{fxrpSharePrice}</span></p>
                <p>User Value: <span className="text-[#E1BAC2]">{fxrpUserValue}</span></p>
                <p>Has Strategy: <span className="text-[#E1BAC2]">{fxrpHasActiveStrategy ? 'yes' : 'no'}</span></p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PORTFOLIO OVERVIEW */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.5, delay: 0.1}}
          className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#1E1E1E] to-[#2a2a2a] text-white relative overflow-hidden"
        >
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#E1BAC2]/10 rounded-full blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-[#E1BAC2]/20 flex items-center justify-center">
                <Layers className="w-4 h-4 text-[#E1BAC2]" />
              </div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">
                Total Portfolio Value
              </span>
            </div>

            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-4xl sm:text-5xl font-extrabold" style={{fontFamily: 'Manrope, sans-serif'}}>
                {formatNumber(fxrpUserSharesNum + cdpUserSharesNum)}
              </span>
              <span className="text-lg font-semibold text-white/60">Flux</span>
            </div>

            <div className="flex items-center gap-4 text-sm text-white/80">
              <span>
                ≈ {formatNumber(fxrpUserValue + cdpUserValue)} XRP
              </span>
              <span className="text-[#E1BAC2] font-bold">
                ≈ {formatUsd(xrpToUsd(fxrpUserValue + cdpUserValue, xrpPrice))}
              </span>
              {fxrpAccruedYield > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +{formatNumber(fxrpAccruedYield)} XRP earned
                </span>
              )}
            </div>

            {/* Live Price Ticker */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
                <span className="text-[10px] font-mono text-white/60">XRP</span>
                <span className="text-[10px] font-mono font-bold text-white">${xrpPrice.toFixed(4)}</span>
                <span className={`text-[9px] font-mono ${xrpPriceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {xrpPriceChange >= 0 ? '+' : ''}{xrpPriceChange.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
                <span className="text-[10px] font-mono text-white/60">BTC</span>
                <span className="text-[10px] font-mono font-bold text-white">${btcPrice.toLocaleString()}</span>
                <span className={`text-[9px] font-mono ${btcPriceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {btcPriceChange >= 0 ? '+' : ''}{btcPriceChange.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
                <span className="text-[10px] font-mono text-white/60">CDP</span>
                <span className="text-[10px] font-mono font-bold text-white">${cdpPrice.toFixed(4)}</span>
                <span className={`text-[9px] font-mono ${cdpPriceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {cdpPriceChange >= 0 ? '+' : ''}{cdpPriceChange.toFixed(2)}%
                </span>
              </div>
              {isPriceLoading && (
                <RefreshCw className="w-3 h-3 text-white/40 animate-spin" />
              )}
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* KEY METRICS GRID */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <MetricCard
            label="Your Value"
            value={formatUsd(xrpToUsd(fxrpUserValue + cdpUserValue, xrpPrice))}
            suffix=""
            icon={<DollarSign className="w-4 h-4" />}
            subtext={`${formatNumber(fxrpUserSharesNum + cdpUserSharesNum)} Flux ≈ ${formatNumber(fxrpUserValue + cdpUserValue)} XRP`}
            delay={0.15}
          />
          <MetricCard
            label="Vault TVL"
            value={formatUsd(xrpToUsd(combinedTotalAssets, xrpPrice))}
            suffix=""
            icon={<BarChart3 className="w-4 h-4" />}
            subtext={`${formatNumber(fxrpTotalAssetsNum, 2)} XRP · ${formatNumber(cdpTotalAssetsNum, 2)} CDP`}
            delay={0.2}
          />
          <MetricCard
            label="Your Share"
            value={`${(((fxrpUserValue + cdpUserValue) / (combinedTotalAssets || 1)) * 100).toFixed(2)}`}
            suffix="%"
            icon={<Target className="w-4 h-4" />}
            subtext="of vault TVL"
            delay={0.25}
          />
          <MetricCard
            label="Gas Balance"
            value={nativeBalance ? parseFloat(nativeBalance.formatted).toFixed(2) : '—'}
            suffix="C2FLR"
            icon={<Wallet className="w-4 h-4" />}
            subtext="Testnet gas (no market price)"
            delay={0.3}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ACTIVE STRATEGY + YIELD PROJECTIONS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          {/* ─── Active Strategy Card ─── */}
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5, delay: 0.3}}
            className="glass-panel p-6 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
          >
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#1E1E1E]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#171414] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-[#E1BAC2]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                    Active Strategy
                  </h3>
                  <p className="text-[10px] text-[#4A4A4A]">
                    Vault strategy · FCC/TEE managed · shared by all depositors
                  </p>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border ${
                fxrpHasActiveStrategy
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${fxrpHasActiveStrategy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
                {fxrpHasActiveStrategy ? 'Active' : 'Idle'}
              </div>
            </div>

            {fxrpHasActiveStrategy ? (
              <div>
                {/* Strategy Header */}
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">{fxrpStrategyInfo.icon}</span>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                      {fxrpStrategyInfo.name}
                    </h4>
                    <p className="text-xs text-[#4A4A4A] mt-0.5">
                      {fxrpStrategyInfo.description}
                    </p>
                  </div>
                </div>

                {/* Strategy Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                    <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">APY Range</p>
                    <p className="text-sm font-bold text-emerald-600">{fxrpStrategyInfo.apy}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                    <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Risk Level</p>
                    <p className="text-sm font-bold text-[#1E1E1E]">{fxrpStrategyInfo.riskLevel}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                    <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Protocol</p>
                    <p className="text-sm font-bold text-[#1E1E1E]">{fxrpStrategyInfo.protocol}</p>
                  </div>
                </div>

                {/* Amount in Strategy (individual per-account) */}
                <div className="p-4 rounded-2xl bg-[#1E1E1E] text-white mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-[#E1BAC2] uppercase tracking-wider">Your Deployed Capital</span>
                  </div>
                  <div className="text-xl font-extrabold" style={{fontFamily: 'Manrope, sans-serif'}}>
                    {formatNumber(fxrpUserDeployed)} XRP
                  </div>
                  <p className="text-[11px] text-white/60 mt-1">
                    {fxrpStrategyValueNum > 0 && fxrpUserSharesNum > 0 && (
                      <>
                        {fxrpUserSharePct.toFixed(1)}% of vault deployment ·{' '}
                      </>
                    )}
                    Earning {fxrpStrategyInfo.apy} APY from {fxrpStrategyInfo.protocol}
                  </p>
                </div>

                {/* Contract Address */}
                <div className="flex items-center gap-2 text-[10px] font-mono text-[#4A4A4A]">
                  <span>Strategy:</span>
                  <a
                    href={`${EXPLORER_BASE_URL}/address/${fxrpActiveStrategy}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E1BAC2] hover:underline flex items-center gap-1"
                  >
                    {fxrpActiveStrategy?.slice(0, 6)}...{fxrpActiveStrategy?.slice(-4)}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ) : (
              /* No Strategy Active */
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-amber-500" />
                </div>
                <h4 className="text-base font-bold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
                  Capital Not Deployed
                </h4>
                <p className="text-xs text-[#4A4A4A] mb-4 max-w-xs mx-auto">
                  Your {formatNumber(fxrpUserSharesNum)} Flux is held in the vault. Deploy to start earning {fxrpStrategyInfo.apy} APY.
                </p>
            <button
              onClick={onNavigateToDeposit}
              className="px-6 py-2.5 rounded-full bg-[#1E1E1E] text-[#E1BAC2] text-[11px] font-bold uppercase tracking-[0.12em] hover:bg-[#000000] transition-all shadow-md flex items-center gap-2 mx-auto"
            >
              <Zap className="w-3.5 h-3.5" />
              Activate Yield
            </button>
              </div>
            )}
          </motion.div>

          {/* ─── Yield Projections Card ─── */}
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5, delay: 0.35}}
            className="glass-panel p-6 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
          >
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#1E1E1E]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                    Yield Projections
                  </h3>
                  <p className="text-[10px] text-[#4A4A4A]">
                    Estimated earnings over time
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-mono text-[#4A4A4A] uppercase">Est. APY</p>
                <p className="text-sm font-bold text-emerald-600">
                  {fxrpHasActiveStrategy ? fxrpStrategyInfo.apy : 'N/A'}
                </p>
              </div>
            </div>

            {/* Time Period Selector */}
            <div className="flex gap-2 mb-5">
              {[7, 30, 90, 365].map((days) => (
                <button
                  key={days}
                  onClick={() => setProjectionDays(days)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                    projectionDays === days
                      ? 'bg-[#1E1E1E] text-[#E1BAC2]'
                      : 'bg-[#F5F5F3] text-[#4A4A4A] hover:bg-[#1E1E1E]/10'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>

            {/* Yield Summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <YieldMetric
                label={`${projectionDays}D`}
                value={formatUsd(xrpToUsd(dailyYield * projectionDays, xrpPrice))}
                sublabel={`${formatNumber(dailyYield * projectionDays)} XRP`}
                highlight
              />
              <YieldMetric
                label="Daily"
                value={formatUsd(xrpToUsd(dailyYield, xrpPrice))}
                sublabel={`${formatNumber(dailyYield)} XRP`}
              />
              <YieldMetric
                label="Yearly"
                value={formatUsd(xrpToUsd(yearlyYield, xrpPrice))}
                sublabel={`${formatNumber(yearlyYield, 2)} XRP`}
              />
            </div>

            {/* Projection Chart */}
            {fxrpUserValue > 0 && fxrpHasActiveStrategy ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData} margin={{top: 5, right: 5, left: 0, bottom: 0}}>
                    <defs>
                      <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      stroke="#4A4A4A"
                      strokeOpacity={0.4}
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#4A4A4A"
                      strokeOpacity={0.4}
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v.toFixed(1)}`}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FAFAF8',
                        borderColor: '#1E1E1E',
                        borderRadius: '12px',
                        fontSize: '11px',
                      }}
                      formatter={(value: any, name: string) => [
                        `${formatUsd(xrpToUsd(Number(value), xrpPrice))} (${Number(value).toFixed(4)} XRP)`,
                        name === 'value' ? 'Projected Value' : 'Yield',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#yieldGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center bg-[#F5F5F3] rounded-2xl border border-dashed border-[#1E1E1E]/20">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 text-[#4A4A4A]/30 mx-auto mb-2" />
                  <p className="text-xs text-[#4A4A4A]">
                    {fxrpUserValue > 0
                      ? 'Deploy capital to see yield projections'
                      : 'Deposit FXRP to see yield projections'}
                  </p>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
              <Info className="w-3.5 h-3.5 text-[#4A4A4A] mt-0.5 shrink-0" />
              <p className="text-[10px] text-[#4A4A4A] leading-relaxed">
                Projections are estimates based on historical APY ranges. Actual yields vary with market conditions. Past performance is not indicative of future results.
              </p>
            </div>
          </motion.div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* CDP VAULT (always visible when deployed) */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {isCdpDeployed && (
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5, delay: 0.4}}
            className="mb-8 glass-panel p-6 rounded-3xl border border-[#E1BAC2]/30 shadow-soft-editorial bg-white/60"
          >
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#1E1E1E]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#E1BAC2]/20 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-[#E1BAC2]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                    CDP Vault <span className="text-[10px] font-mono text-[#4A4A4A]">(fyCDP)</span>
                  </h3>
                  <p className="text-[10px] text-[#4A4A4A]">
                    Stablecoin yield · shared by all depositors
                  </p>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border ${
                cdpHasActiveStrategy
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cdpHasActiveStrategy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
                {cdpHasActiveStrategy ? 'Active' : 'Ready'}
              </div>
            </div>

            {/* Strategy Header */}
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl">{cdpStrategyInfo.icon}</span>
              <div className="flex-1">
                <h4 className="text-base font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                  {cdpStrategyInfo.name}
                </h4>
                <p className="text-xs text-[#4A4A4A] mt-0.5">
                  {cdpStrategyInfo.description}
                </p>
              </div>
            </div>

            {/* Strategy Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">APY Range</p>
                <p className="text-sm font-bold text-emerald-600">{cdpStrategyInfo.apy}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Risk Level</p>
                <p className="text-sm font-bold text-[#1E1E1E]">{cdpStrategyInfo.riskLevel}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Protocol</p>
                <p className="text-sm font-bold text-[#1E1E1E]">{cdpStrategyInfo.protocol}</p>
              </div>
            </div>

            {cdpUserSharesNum > 0 ? (
              /* Holder position */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                  <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Your fyCDP</p>
                  <p className="text-sm font-bold text-[#1E1E1E]">{formatNumber(cdpUserSharesNum)}</p>
                  <p className="text-[10px] text-[#4A4A4A]">≈ {formatNumber(cdpUserValue)} CDP</p>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                  <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Share Price</p>
                  <p className="text-sm font-bold text-[#1E1E1E]">{cdpSharePrice.toFixed(6)}</p>
                  <p className="text-[10px] text-[#4A4A4A]">CDP per fyCDP</p>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                  <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Vault TVL</p>
                  <p className="text-sm font-bold text-[#1E1E1E]">{formatNumber(cdpTotalAssetsNum, 2)}</p>
                  <p className="text-[10px] text-[#4A4A4A]">CDP in vault</p>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
                  <p className="text-[10px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">Your Share</p>
                  <p className="text-sm font-bold text-[#1E1E1E]">
                    {cdpTotalSupplyNum > 0 ? `${((cdpUserSharesNum / cdpTotalSupplyNum) * 100).toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-[#4A4A4A]">of CDP vault</p>
                </div>
              </div>
            ) : (
              /* Empty state for non-holders */
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-[#F5F5F3] border border-dashed border-[#1E1E1E]/20">
                <div className="text-center sm:text-left">
                  <p className="text-sm font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                    No CDP deposits yet
                  </p>
                  <p className="text-[11px] text-[#4A4A4A] mt-0.5">
                    Deposit CDP to start earning {cdpStrategyInfo.apy} APY · {formatNumber(cdpTotalAssetsNum, 2)} CDP currently in the vault
                  </p>
                </div>
                <button
                  onClick={onNavigateToDeposit}
                  className="px-6 py-2.5 rounded-full bg-[#1E1E1E] text-[#E1BAC2] text-[11px] font-bold uppercase tracking-[0.12em] hover:bg-[#000000] transition-all shadow-md flex items-center gap-2 shrink-0"
                >
                  <Coins className="w-3.5 h-3.5" />
                  Deposit CDP
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* QUICK ACTIONS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5, delay: 0.45}}
          >
            <button
              onClick={onNavigateToDeposit}
              className="w-full p-5 rounded-2xl glass-panel border border-[#1E1E1E]/15 hover:border-[#E1BAC2]/50 hover:shadow-[0_8px_32px_rgba(225,186,194,0.12)] transition-all duration-300 text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#1E1E1E] flex items-center justify-center group-hover:bg-[#E1BAC2] transition-colors">
                  <ArrowDownRight className="w-5 h-5 text-[#E1BAC2] group-hover:text-[#1E1E1E] transition-colors" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                    Deposit XRP
                  </h4>
                  <p className="text-[11px] text-[#4A4A4A]">
                    Add to your vault and start earning yield
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#4A4A4A] group-hover:text-[#E1BAC2] transition-colors" />
              </div>
            </button>
          </motion.div>

          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5, delay: 0.5}}
          >
            <button
              onClick={onNavigateToWithdraw}
              disabled={fxrpUserSharesNum === 0}
              className="w-full p-5 rounded-2xl glass-panel border border-[#1E1E1E]/15 hover:border-[#E1BAC2]/50 hover:shadow-[0_8px_32px_rgba(225,186,194,0.12)] transition-all duration-300 text-left group disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#1E1E1E]/15 flex items-center justify-center group-hover:border-[#E1BAC2] transition-colors">
                  <ArrowUpRight className="w-5 h-5 text-[#1E1E1E] group-hover:text-[#E1BAC2] transition-colors" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
                    Withdraw Flux
                  </h4>
                  <p className="text-[11px] text-[#4A4A4A]">
                    {fxrpUserSharesNum > 0
                      ? `Redeem ${formatNumber(fxrpUserSharesNum)} Flux for XRP`
                      : 'No Flux tokens to withdraw'}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#4A4A4A] group-hover:text-[#E1BAC2] transition-colors" />
              </div>
            </button>
          </motion.div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HOW IT WORKS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.5, delay: 0.55}}
          className="glass-panel p-6 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
        >
          <h3 className="text-sm font-bold text-[#1E1E1E] mb-5" style={{fontFamily: 'Manrope, sans-serif'}}>
            How It Works
          </h3>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">              <FlowStep
                icon={<Wallet className="w-5 h-5" />}
                label="Deposit XRP"
                sublabel="Send from wallet"
                active={fxrpUserSharesNum > 0}
                number={1}
              />
              <ArrowRight className="w-4 h-4 text-[#4A4A4A] rotate-90 sm:rotate-0" />
              <FlowStep
                icon={<Layers className="w-5 h-5" />}
                label="Get Flux"
                sublabel="Vault shares"
                active={fxrpUserSharesNum > 0}
                number={2}
              />
              <ArrowRight className="w-4 h-4 text-[#4A4A4A] rotate-90 sm:rotate-0" />
              <FlowStep
                icon={<Cpu className="w-5 h-5" />}
                label="Auto-Deploy"
                sublabel="FCC to strategy"
                active={fxrpHasActiveStrategy}
                number={3}
              />
              <ArrowRight className="w-4 h-4 text-[#4A4A4A] rotate-90 sm:rotate-0" />
              <FlowStep
                icon={<TrendingUp className="w-5 h-5" />}
                label="Earn Yield"
                sublabel="Auto-compound"
                active={fxrpHasActiveStrategy && fxrpAccruedYield > 0}
                number={4}
              />
          </div>
        </motion.div>

        {/* View All Strategies Link */}
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.5, delay: 0.6}}
          className="mt-6 text-center"
        >
          <button
            onClick={() => setShowStrategiesModal(true)}
            className="inline-flex items-center gap-2 text-xs font-bold text-[#4A4A4A] hover:text-[#E1BAC2] transition-colors"
          >
            View All Available Strategies
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>

      </div>

      {/* ─── Strategies Modal ─── */}
      <StrategiesModal
        isOpen={showStrategiesModal}
        onClose={() => setShowStrategiesModal(false)}
        activeStrategy={fxrpActiveStrategy as string}
      />
    </div>
  );
};

// ─── Metric Card Component ──────────────────────────────────────────────────
const MetricCard: React.FC<{
  label: string;
  value: string;
  suffix: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subtext?: string;
  delay: number;
}> = ({label, value, suffix, icon, trend, subtext, delay}) => (
  <motion.div
    initial={{opacity: 0, y: 20}}
    animate={{opacity: 1, y: 0}}
    transition={{duration: 0.5, delay, ease: [0.16, 1, 0.3, 1]}}
    className="glass-panel p-4 rounded-2xl border border-[#1E1E1E]/15 hover:border-[#E1BAC2]/40 transition-all duration-300"
  >
    <div className="flex items-center justify-between mb-2">
      <p className="text-[9px] font-mono font-bold text-[#4A4A4A] uppercase tracking-[0.15em]">{label}</p>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
        trend === 'up' ? 'bg-emerald-500/10 text-emerald-600' :
        trend === 'down' ? 'bg-red-500/10 text-red-600' :
        'bg-[#1E1E1E]/10 text-[#4A4A4A]'
      }`}>
        {icon}
      </div>
    </div>
    <div className="flex items-baseline gap-1">
      <p className="text-lg font-extrabold text-[#1E1E1E] leading-tight" style={{fontFamily: 'Manrope, sans-serif'}}>
        {value}
      </p>
      {suffix && <span className="text-[10px] font-mono text-[#4A4A4A]">{suffix}</span>}
    </div>
    {subtext && (
      <p className="text-[10px] text-[#4A4A4A] mt-1 truncate">{subtext}</p>
    )}
  </motion.div>
);

// ─── Yield Metric Component ─────────────────────────────────────────────────
const YieldMetric: React.FC<{
  label: string;
  value: string;
  sublabel: string;
  highlight?: boolean;
}> = ({label, value, sublabel, highlight}) => (
  <div className={`p-3 rounded-xl text-center ${highlight ? 'bg-emerald-50 border border-emerald-200' : 'bg-[#F5F5F3] border border-[#1E1E1E]/10'}`}>
    <p className="text-[9px] font-mono text-[#4A4A4A] uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-sm font-bold ${highlight ? 'text-emerald-600' : 'text-[#1E1E1E]'}`}>
      +{value}
    </p>
    <p className="text-[9px] text-[#4A4A4A]">{sublabel}</p>
  </div>
);

// ─── Flow Step Component ────────────────────────────────────────────────────
const FlowStep: React.FC<{
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  active: boolean;
  number: number;
}> = ({icon, label, sublabel, active, number}) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
      active ? 'bg-emerald-500 text-white' : 'bg-[#F5F5F3] border border-[#1E1E1E]/15 text-[#4A4A4A]'
    }`}>
      {active ? icon : <span className="text-xs font-bold">{number}</span>}
    </div>
    <div>
      <p className={`text-xs font-bold ${active ? 'text-emerald-700' : 'text-[#1E1E1E]'}`}>{label}</p>
      <p className="text-[10px] text-[#4A4A4A]">{sublabel}</p>
    </div>
  </div>
);
