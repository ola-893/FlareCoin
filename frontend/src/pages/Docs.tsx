import React, {useState, useEffect, useRef} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Search, BookOpen, Shield, Layers, Zap, ArrowRight, ChevronRight, Code, ExternalLink, Copy, Check, Menu, X, ArrowDownToLine, Clock, AlertTriangle, Lock, FileText, Wallet} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import logoUrl from '../assets/logo/logo.webp';

// ─── Section Definitions ───
interface DocSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  subsections?: {id: string; title: string}[];
}

const sections: DocSection[] = [
  {id: 'overview', title: 'Protocol Overview', icon: <BookOpen className="w-4 h-4" />},
  {id: 'getting-started', title: 'Getting Started', icon: <Zap className="w-4 h-4" />,
    subsections: [
      {id: 'connect-wallet', title: 'Connect Your Wallet'},
      {id: 'deposit-flow', title: 'Depositing Assets'},
      {id: 'withdraw-flow', title: 'Withdrawing Assets'},
    ]
  },
  {id: 'architecture', title: 'Architecture', icon: <Layers className="w-4 h-4" />,
    subsections: [
      {id: 'parent-vault', title: 'ParentVault (ERC-4626)'},
      {id: 'strategy-adapters', title: 'Strategy Adapters'},
      {id: 'fasset-integration', title: 'FAsset Direct Minting'},
    ]
  },
  {id: 'strategies', title: 'Yield Strategies', icon: <ArrowDownToLine className="w-4 h-4" />,
    subsections: [
      {id: 'kinetic-strategy', title: 'Kinetic Lending'},
      {id: 'enosys-strategy', title: 'Enosys DEX LP'},
    ]
  },
  {id: 'security', title: 'Security Model', icon: <Shield className="w-4 h-4" />,
    subsections: [
      {id: 'tee-rebalancing', title: 'TEE Rebalancing'},
      {id: 'slippage-protection', title: 'Slippage Protection'},
      {id: 'upgradeability', title: 'Upgradeability'},
    ]
  },
  {id: 'contracts', title: 'Smart Contracts', icon: <Code className="w-4 h-4" />,
    subsections: [
      {id: 'contract-addresses', title: 'Deployed Addresses'},
      {id: 'contract-interfaces', title: 'Interfaces'},
    ]
  },
  {id: 'faq', title: 'FAQ', icon: <FileText className="w-4 h-4" />},
];

// ─── Code Block Component ───
const CodeBlock: React.FC<{code: string; language?: string}> = ({code, language = 'solidity'}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-[rgba(23,20,20,0.08)] bg-[#171414]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-[#E1BAC2]">{language}</span>
        <button onClick={handleCopy} className="text-white/40 hover:text-white/80 transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[12px] leading-relaxed text-white/80 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// ─── Info Card Component ───
const InfoCard: React.FC<{type?: 'info' | 'warning' | 'tip'; title: string; children: React.ReactNode}> = ({type = 'info', title, children}) => {
  const styles = {
    info: {border: 'border-blue-200', bg: 'bg-blue-50/50', icon: <BookOpen className="w-4 h-4 text-blue-500" />, titleColor: 'text-blue-800'},
    warning: {border: 'border-amber-200', bg: 'bg-amber-50/50', icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, titleColor: 'text-amber-800'},
    tip: {border: 'border-emerald-200', bg: 'bg-emerald-50/50', icon: <Zap className="w-4 h-4 text-emerald-500" />, titleColor: 'text-emerald-800'},
  };
  const s = styles[type];
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 my-4`}>
      <div className="flex items-center gap-2 mb-2">
        {s.icon}
        <span className={`text-xs font-bold uppercase tracking-[0.1em] ${s.titleColor} font-['Manrope',sans-serif]`}>{title}</span>
      </div>
      <div className="text-sm text-[#4A4A4A] leading-relaxed font-['Hanken_Grotesk',sans-serif]">{children}</div>
    </div>
  );
};

// ─── Table Component ───
const DocTable: React.FC<{headers: string[]; rows: string[][]}> = ({headers, rows}) => (
  <div className="overflow-x-auto my-4 rounded-xl border border-[rgba(23,20,20,0.08)]">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-[#171414]">
          {headers.map((h, i) => (
            <th key={i} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[#E1BAC2] font-['Manrope',sans-serif]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? 'bg-white/60' : 'bg-[#F5F5F3]'}>
            {row.map((cell, j) => (
              <td key={j} className="px-4 py-3 text-xs text-[#171414] font-mono border-t border-[rgba(23,20,20,0.04)]">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Main Docs Page ───
export const Docs: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{section: string; text: string}[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      {rootMargin: '-80px 0px -70% 0px', threshold: 0}
    );

    const allIds = sections.flatMap(s => [s.id, ...(s.subsections?.map(sub => sub.id) || [])]);
    allIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    const results: {section: string; text: string}[] = [];
    sections.forEach(s => {
      if (s.title.toLowerCase().includes(query)) {
        results.push({section: s.id, text: s.title});
      }
      s.subsections?.forEach(sub => {
        if (sub.title.toLowerCase().includes(query)) {
          results.push({section: sub.id, text: sub.title});
        }
      });
    });
    setSearchResults(results.slice(0, 5));
  }, [searchQuery]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({behavior: 'smooth', block: 'start'});
      setActiveSection(id);
      setMobileMenuOpen(false);
    }
  };

  const isActive = (id: string) => activeSection === id;

  return (
    <div className="min-h-screen bg-[#F5F5F3]">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#F5F5F3]/90 backdrop-blur-xl border-b border-[rgba(23,20,20,0.06)]">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between h-14 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-[#171414] bg-[#171414]">
              <img src={logoUrl} alt="Flux" className="h-6 w-auto object-contain" />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(225,186,194,0.1)] border border-[rgba(225,186,194,0.2)]">
              <BookOpen className="w-3 h-3 text-[#E1BAC2]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#171414] font-['Manrope',sans-serif]">Documentation</span>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-64 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4A4A4A]" />
            <input
              type="text"
              placeholder="Search docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full bg-white/60 border border-[rgba(23,20,20,0.08)] text-xs text-[#171414] placeholder:text-[#4A4A4A]/50 focus:outline-none focus:border-[#E1BAC2] focus:shadow-[0_0_0_3px_rgba(225,186,194,0.15)] transition-all font-['Hanken_Grotesk',sans-serif]"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl border border-[rgba(23,20,20,0.1)] shadow-lg overflow-hidden z-10">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {scrollToSection(r.section); setSearchQuery('');}}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-[rgba(225,186,194,0.08)] transition-colors flex items-center gap-2"
                  >
                    <ChevronRight className="w-3 h-3 text-[#E1BAC2]" />
                    <span className="text-[#171414] font-['Hanken_Grotesk',sans-serif]">{r.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] text-[#4A4A4A] hover:text-[#171414] hover:bg-white/60 transition-all font-['Manrope',sans-serif]">
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
            <button onClick={() => navigate('/')} className="px-4 py-1.5 rounded-full bg-[#171414] text-[#E1BAC2] text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-black transition-all font-['Manrope',sans-serif]">
              Open App
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg hover:bg-white/60 transition-colors">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex pt-14">
        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 bg-[#171414]/40 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`${mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 w-72 bg-[#F5F5F3] shadow-2xl pt-14' : 'hidden'} md:block md:w-64 lg:w-72 md:fixed md:top-14 md:bottom-0 md:overflow-y-auto`}>
          <div className="sticky top-0 p-3 md:hidden">
            <button onClick={() => setMobileMenuOpen(false)} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold text-[#4A4A4A] hover:bg-white/60 transition-colors">
              <X className="w-4 h-4" />
              Close
            </button>
          </div>
          <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-56px)]">
            {sections.map(section => (
              <div key={section.id}>
                <button
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 font-['Manrope',sans-serif] ${
                    isActive(section.id)
                      ? 'bg-[#171414] text-[#E1BAC2] shadow-[0_0_16px_rgba(225,186,194,0.15)]'
                      : 'text-[#4A4A4A] hover:bg-white/60 hover:text-[#171414]'
                  }`}
                >
                  {section.icon}
                  {section.title}
                </button>
                {section.subsections && (
                  <div className="ml-7 mt-1 space-y-0.5 border-l border-[rgba(23,20,20,0.06)] pl-3">
                    {section.subsections.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => scrollToSection(sub.id)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition-all font-['Hanken_Grotesk',sans-serif] ${
                          isActive(sub.id)
                            ? 'text-[#E1BAC2] font-semibold bg-[rgba(225,186,194,0.08)]'
                            : 'text-[#4A4A4A]/70 hover:text-[#171414]'
                        }`}
                      >
                        {sub.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main ref={contentRef} className="flex-1 md:ml-64 lg:ml-72 px-4 sm:px-6 lg:px-16 py-6 sm:py-10 pb-24 sm:pb-32 max-w-4xl">
          {/* ═══ PROTOCOL OVERVIEW ═══ */}
          <section id="overview" className="mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-[rgba(23,20,20,0.1)] text-[10px] font-bold text-[#171414] uppercase tracking-[0.2em] mb-4 bg-white/40 font-['Manrope',sans-serif]">
              <BookOpen className="w-3.5 h-3.5 text-[#E1BAC2]" />
              Introduction
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#171414] mb-4 font-['Manrope',sans-serif] leading-tight">
              Flux Protocol Documentation
            </h1>
            <p className="text-base text-[#4A4A4A] leading-relaxed mb-6 font-['Hanken_Grotesk',sans-serif] max-w-2xl">
              Flux is a non-custodial yield-optimization protocol built on <strong className="text-[#171414]">Flare Network</strong>. The current Coston2 demonstration supports a native-XRP route and direct ERC-4626 CDP deposits. Native XRP payments are verified with an FDC proof before vault shares can be minted.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                {icon: <Layers className="w-5 h-5" />, title: 'ERC-4626 Vault', desc: 'Standardized tokenized vault for deposits, withdrawals, and share accounting'},
                {icon: <Shield className="w-5 h-5" />, title: 'TEE-Secured', desc: 'All rebalancing operations are cryptographically signed by a Trusted Execution Environment'},
                {icon: <Zap className="w-5 h-5" />, title: 'FAsset Native', desc: 'Leverages Flare\'s FAsset system for trustless cross-chain deposits without bridges'},
              ].map((card, i) => (
                <div key={i} className="p-5 rounded-2xl bg-white/60 border border-[rgba(23,20,20,0.08)] backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-xl bg-[#171414] flex items-center justify-center mb-3 shadow-[0_0_12px_rgba(225,186,194,0.15)]">
                    <span className="text-[#E1BAC2]">{card.icon}</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#171414] mb-1 font-['Manrope',sans-serif]">{card.title}</h3>
                  <p className="text-xs text-[#4A4A4A] leading-relaxed font-['Hanken_Grotesk',sans-serif]">{card.desc}</p>
                </div>
              ))}
            </div>

            <InfoCard type="tip" title="Testnet Deployment">
              Flux is currently deployed on <strong>Flare Coston2 Testnet</strong>. All contract addresses and interactions in this documentation reference the testnet deployment. Do not send real mainnet assets.
            </InfoCard>

            <h2 className="text-xl font-bold text-[#171414] mt-8 mb-3 font-['Manrope',sans-serif]">How It Works</h2>
            <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
              Flux abstracts the complexity of cross-chain DeFi into three simple steps:
            </p>
            <div className="space-y-3 mb-6">
              {[
                {step: '01', title: 'Deposit', desc: 'Users send native XRP to the FAssets Core Vault with a Flux destination tag. Flare\'s FAsset system converts it into FXRP only after an XRPPayment proof is verified on-chain.'},
                {step: '02', title: 'Optimize', desc: 'The ParentVault deploys capital into approved yield strategies (Kinetic lending, Enosys DEX LP) via strategy adapters. A TEE enclave monitors yields across DeFi protocols and signs rebalance payloads when a better opportunity is found.'},
                {step: '03', title: 'Earn', desc: 'Users hold Flux tokens (ERC-4626 shares) that accrue yield automatically. Token value increases as the underlying strategies earn interest, trading fees, and protocol rewards. Withdrawals are instant when liquidity is available.'},
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl bg-white/60 border border-[rgba(23,20,20,0.06)]">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#171414] flex items-center justify-center">
                    <span className="text-xs font-bold text-[#E1BAC2] font-mono">{item.step}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#171414] mb-1 font-['Manrope',sans-serif]">{item.title}</h4>
                    <p className="text-xs text-[#4A4A4A] leading-relaxed font-['Hanken_Grotesk',sans-serif]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ GETTING STARTED ═══ */}
          <section id="getting-started" className="mb-16">
            <SectionHeader id="getting-started" icon={<Zap className="w-5 h-5" />} title="Getting Started" />
            <p className="text-sm text-[#4A4A4A] leading-relaxed mb-8 font-['Hanken_Grotesk',sans-serif]">
              Follow these guides to start earning yield on your assets through Flux Protocol.
            </p>

            <div id="connect-wallet" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Connect Your Wallet</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                Flux supports multiple wallet providers for the Flare Network:
              </p>
              <DocTable
                headers={['Wallet', 'Type', 'Best For']}
                rows={[
                  ['MetaMask', 'Browser Extension', 'EVM-native users — direct connection via window.ethereum'],
                  ['Rabby Wallet', 'Browser Extension', 'Multi-chain users with Flare support'],
                  ['Bifrost Wallet', 'Mobile / Desktop', 'Recommended by Flare Foundation for native FAsset flows'],
                  ['Ledger', 'Hardware Wallet', 'Maximum security for large deposits'],
                  ['WalletConnect', 'QR Code / Mobile', 'Any mobile wallet with WalletConnect v2 support'],
                ]}
              />
              <InfoCard type="info" title="Network Requirement">
                All wallets must be connected to <strong>Flare Coston2 Testnet</strong> (Chain ID: 114). The app will prompt you to switch networks if connected to the wrong chain.
              </InfoCard>
            </div>

            <div id="deposit-flow" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Depositing Assets</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                Flux supports two deposit flows depending on your starting asset:
              </p>

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">Standard ERC-4626 Deposit</h4>
              <p className="text-xs text-[#4A4A4A] leading-relaxed mb-3 font-['Hanken_Grotesk',sans-serif]">
                For assets already on Flare (e.g., USDC.e, FXRP), deposits are direct ERC-4626 calls:
              </p>
              <CodeBlock language="solidity" code={`// Deposit 100 USDC.e into the ParentVault
uint256 assets = 100e6; // USDC.e has 6 decimals
IERC20(USDC_E).approve(address(vault), assets);
uint256 shares = vault.deposit(assets, msg.sender);

// shares received = (assets * totalSupply) / totalAssets
// If totalSupply == 0, shares == assets (1:1 initial rate)`} />

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">FAsset Direct Minting (Cross-Chain)</h4>
              <p className="text-xs text-[#4A4A4A] leading-relaxed mb-3 font-['Hanken_Grotesk',sans-serif]">
                The native-XRP route uses Flare's FAsset Direct Minting system and FDC. The flow is:
              </p>
              <div className="space-y-2 mb-4">
                {[
                  'Register a MintingTag with the FDC direct-mint adapter (one-time; this costs the Flare tag reservation fee)',
                  'Send native XRP on XRPL Testnet to the FAssets Core Vault using that destination tag',
                  'Request an FDC XRPPayment attestation for the validated XRPL transaction hash',
                  'After FDC finalization, relay the returned Merkle proof to the adapter',
                  'The live FAssets AssetManager verifies the proof and mints FXRP',
                  'The adapter pays the executor fee and atomically deposits the verified net FXRP into ParentVault, which mints Flux shares to the tag owner',
                ].map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#171414] flex items-center justify-center text-[10px] font-bold text-[#E1BAC2] font-mono">{i + 1}</span>
                    <p className="text-xs text-[#4A4A4A] leading-relaxed font-['Hanken_Grotesk',sans-serif] pt-0.5">{step}</p>
                  </div>
                ))}
              </div>

              <InfoCard type="warning" title="FDC Finalization">
                FAsset deposits are <strong>not instant</strong>. The Flare Data Connector must finalize the XRPPayment proof before the asset manager can mint. The application will wait for the FDC round, then lets any user relay the proof without trusting a Flux server.
              </InfoCard>
            </div>

            <div id="withdraw-flow" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Withdrawing Assets</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                Withdrawals burn your Flux tokens and return the underlying asset. The vault first checks its idle balance; if insufficient, it pulls funds from the active strategy.
              </p>
              <CodeBlock language="solidity" code={`// Redeem all shares for underlying assets
uint256 shares = vault.balanceOf(msg.sender);
vault.redeem(shares, msg.sender, msg.sender);

// Or withdraw a specific amount of underlying
uint256 assetsToWithdraw = 50e6; // 50 USDC.e
vault.withdraw(assetsToWithdraw, msg.sender, msg.sender);`} />

              <InfoCard type="info" title="Liquidity Buffer">
                The vault maintains a <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">liquidityBufferBps</code> (default: 500 = 5%) of assets in idle balance for instant withdrawals. Larger withdrawals may trigger a partial strategy unwind, which incurs slippage on the underlying DEX or lending protocol.
              </InfoCard>
            </div>
          </section>

          {/* ═══ ARCHITECTURE ═══ */}
          <section id="architecture" className="mb-16">
            <SectionHeader id="architecture" icon={<Layers className="w-5 h-5" />} title="Architecture" />
            <p className="text-sm text-[#4A4A4A] leading-relaxed mb-8 font-['Hanken_Grotesk',sans-serif]">
              Flux follows a modular architecture with a central ERC-4626 vault, pluggable strategy adapters, and an asynchronous FAsset bridge adapter.
            </p>

            <div id="parent-vault" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">ParentVault (ERC-4626)</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                The <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">ParentVault</code> is the central contract that holds all user assets. It is an <strong>ERC-4626 tokenized vault</strong> — users deposit an underlying asset (e.g., FXRP, USDC.e) and receive Flux tokens that accrue yield automatically.
              </p>

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">Key Properties</h4>
              <DocTable
                headers={['Property', 'Type', 'Description']}
                rows={[
                  ['asset()', 'address (view)', 'The underlying ERC-20 token (e.g., FXRP, USDC.e)'],
                  ['totalAssets()', 'uint256 (view)', 'Idle balance + activeStrategy.totalValue()'],
                  ['activeStrategy', 'address', 'Currently deployed strategy adapter address'],
                  ['teeAddress', 'address', 'Registered TEE machine authorized to sign FCC action results'],
                  ['liquidityBufferBps', 'uint16', 'Basis points retained locally for instant withdrawals'],
                  ['teeLastActive', 'uint256', 'Timestamp of last successful TEE-signed rebalance'],
                ]}
              />

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">Core Functions</h4>
              <CodeBlock language="solidity" code={`// Standard ERC-4626 deposit — mints shares proportional to assets
function deposit(uint256 assets, address receiver) external returns (uint256 shares);

// Standard ERC-4626 redeem — burns shares, returns underlying
function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

// Asynchronous FAsset deposit — called by FAssetAdapter only
function queueFAssetDeposit(bytes32 depositId, address receiver) external;
function settleFAssetDeposit(bytes32 depositId, uint256 assets) external returns (uint256 shares);

// Permissionless relay of one TEE-authorized FCC action result
function executeRebalance(
    bytes calldata resultData,
    bytes32 actionId,
    string calldata submissionTag,
    uint8 status,
    bytes calldata signature
) external;

// Emergency fallback — DAO-only, requires TEE timeout (7 days)
function forceWithdrawAll(uint256 minAmountOut) external returns (uint256);`} />

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">Withdrawal Flow</h4>
              <p className="text-xs text-[#4A4A4A] leading-relaxed mb-3 font-['Hanken_Grotesk',sans-serif]">
                When a user withdraws, the vault checks its idle balance first. If the idle balance is insufficient to cover the withdrawal, it calls <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">strategy.withdraw()</code> to pull the shortfall from the active strategy:
              </p>
              <CodeBlock language="solidity" code={`function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal override {
    uint256 idleAssets = IERC20(asset()).balanceOf(address(this));
    if (idleAssets < assets) {
        address strategy = activeStrategy;
        if (strategy == address(0)) revert InsufficientLiquidity(assets, idleAssets);

        uint256 shortfall = assets - idleAssets;
        uint256 actualAmountOut = IStrategyAdapter(strategy).withdraw(shortfall, shortfall);
        // ... balance check and revert on insufficient liquidity
    }
    super._withdraw(caller, receiver, owner, assets, shares);
}`} />
            </div>

            <div id="strategy-adapters" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Strategy Adapters</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                Strategy adapters are the yield-generating modules. Each adapter implements the <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">IStrategyAdapter</code> interface, which standardizes how the ParentVault deposits, withdraws, and queries total value.
              </p>
              <CodeBlock language="solidity" code={`interface IStrategyAdapter {
    function asset() external view returns (address);
    function deposit(uint256 amount) external returns (uint256 assetsDeposited);
    function withdraw(uint256 amount, uint256 minAmountOut) external returns (uint256 assetsWithdrawn);
    function withdrawAll(uint256 minAmountOut) external returns (uint256 assetsWithdrawn);
    function totalValue() external view returns (uint256);
}`} />

              <InfoCard type="info" title="Adapter Approval">
                Strategy adapters must be explicitly approved by the vault owner (DAO multi-sig) via <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">setStrategyAdapter(strategy, true)</code>. The vault verifies that the adapter's <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">asset()</code> matches its own underlying asset before approval.
              </InfoCard>
            </div>

            <div id="fasset-integration" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">FAsset Direct Minting</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                The <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">FAssetAdapter</code> bridges non-smart-contract assets into the vault using Flare's FAsset system. It manages a registry of MintingTags (destination identifiers) and routes direct-minted FAssets into the ParentVault.
              </p>

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">Deposit Lifecycle</h4>
              <div className="space-y-2 mb-4">
                {[
                  {label: 'registerMintingTag()', desc: 'User reserves a Flare MintingTag. The adapter owns the tag NFT permanently.'},
                  {label: 'processDirectMint()', desc: 'Executor records the post-fee FAsset amount after the FAsset system mints FXRP.'},
                  {label: 'settleDirectMint()', desc: 'Anyone can call this to transfer FAssets to the vault and mint ERC-4626 shares to the user.'},
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-white/40 border border-[rgba(23,20,20,0.04)]">
                    <code className="flex-shrink-0 text-[11px] font-bold text-[#E1BAC2] bg-[#171414] px-2 py-0.5 rounded font-mono">{item.label}</code>
                    <p className="text-xs text-[#4A4A4A] font-['Hanken_Grotesk',sans-serif]">{item.desc}</p>
                  </div>
                ))}
              </div>

              <InfoCard type="warning" title="Settlement is Permissionless">
                <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">settleDirectMint()</code> is callable by <strong>anyone</strong>, not just the depositor. This prevents censorship — once the direct-mint executor has registered funds, any third party can trigger settlement to mint shares to the user.
              </InfoCard>
            </div>
          </section>

          {/* ═══ YIELD STRATEGIES ═══ */}
          <section id="strategies" className="mb-16">
            <SectionHeader id="strategies" icon={<ArrowDownToLine className="w-5 h-5" />} title="Yield Strategies" />
            <p className="text-sm text-[#4A4A4A] leading-relaxed mb-8 font-['Hanken_Grotesk',sans-serif]">
              Flux currently supports two yield strategies on Flare Network. Both are implemented as strategy adapters conforming to <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">IStrategyAdapter</code>.
            </p>

            <div id="kinetic-strategy" className="mb-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#171414] flex items-center justify-center">
                  <Layers className="w-5 h-5 text-[#E1BAC2]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#171414] font-['Manrope',sans-serif]">Kinetic Lending</h3>
                  <p className="text-[11px] font-mono text-[#4A4A4A]">Compound-v2 fork on Flare</p>
                </div>
              </div>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                The <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">KineticStrategyAdapter</code> deposits assets into Kinetic Market, a Compound-v2 fork deployed on Flare. It receives kTokens (receipt tokens) in return and earns lending interest automatically.
              </p>
              <DocTable
                headers={['Parameter', 'Value']}
                rows={[
                  ['Protocol', 'Kinetic Market (Compound-v2 fork)'],
                  ['Unitroller', '0x15F69897E6aEBE0463401345543C26d1Fd994abB'],
                  ['kUSDC.e', '0xDEeBaBe05BDA7e8C1740873abF715f16164C29B8'],
                  ['Yield Source', 'Lending interest + JOULE reward tokens'],
                  ['Value Calculation', 'kToken.balanceOf * exchangeRateStored / 1e18'],
                  ['Reward Harvesting', 'harvestRewards() — forwarded to DAO treasury'],
                ]}
              />
              <InfoCard type="tip" title="Reward Security">
                Harvested JOULE rewards are <strong>not re-deposited</strong> into the vault. This prevents a reward-donation attack where an attacker could inflate the share price by sending tokens directly to the vault contract.
              </InfoCard>
            </div>

            <div id="enosys-strategy" className="mb-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#171414] flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#E1BAC2]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#171414] font-['Manrope',sans-serif]">Enosys DEX LP</h3>
                  <p className="text-[11px] font-mono text-[#4A4A4A]">Concentrated liquidity on Enosys V3</p>
                </div>
              </div>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                The <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">EnosysStrategyAdapter</code> deploys capital into an Enosys DEX V3 liquidity pool. It swaps half the deposit into the paired token (e.g., WFLR) and holds both balances, earning trading fees.
              </p>
              <DocTable
                headers={['Parameter', 'Value']}
                rows={[
                  ['Protocol', 'Enosys DEX (Uniswap V3 fork)'],
                  ['Strategy', 'Single-asset → concentrated liquidity via swap routing'],
                  ['Oracle', 'TWAP (600s window) for price conversion'],
                  ['Value Calculation', 'heldUnderlying + (heldPairedToken * TWAP price)'],
                  ['Slippage Protection', 'minAmountOut enforced on every withdrawal'],
                ]}
              />
              <InfoCard type="info" title="Oracle Safety">
                The adapter uses <strong>Time-Weighted Average Price (TWAP)</strong> over a 600-second window to convert paired token balances to underlying denomination. This prevents spot-price manipulation attacks from affecting the reported total value.
              </InfoCard>
            </div>
          </section>

          {/* ═══ SECURITY MODEL ═══ */}
          <section id="security" className="mb-16">
            <SectionHeader id="security" icon={<Shield className="w-5 h-5" />} title="Security Model" />
            <p className="text-sm text-[#4A4A4A] leading-relaxed mb-8 font-['Hanken_Grotesk',sans-serif]">
              Flux employs multiple layers of security to protect user funds. Every rebalance operation requires cryptographic attestation, and the protocol includes emergency fallback mechanisms.
            </p>

            <div id="tee-rebalancing" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">TEE Rebalancing (FCC action result)</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                All strategy migrations are authorized by a <strong>Trusted Execution Environment (TEE)</strong> running Flare's Confidential Compute (FCC). The TEE returns a signed action result whose data contains the rebalance parameters:
              </p>
              <CodeBlock language="solidity" code={`struct RebalancePayload {
    address newStrategy;      // Target strategy adapter
    uint256 minAmountOut;     // Minimum acceptable withdrawal amount
    uint256 nonce;            // Replay protection counter
    uint256 deadline;         // Expiration timestamp
    uint256 twapStart;        // TWAP observation window start
    uint256 twapEnd;          // TWAP observation window end (must be >= 24h after start)
    bytes32 strategyDataHash; // Strategy-specific data hash
    // The outer FCC result is signed by teeAddress with EIP-191 personal_sign
}`} />

              <h4 className="text-sm font-bold text-[#171414] mt-6 mb-2 font-['Manrope',sans-serif]">Validation Rules</h4>
              <DocTable
                headers={['Rule', 'Purpose']}
                rows={[
                  ['nonce == rebalanceNonce', 'Prevents replay attacks'],
                  ['block.timestamp <= deadline', 'Prevents stale rebalance execution'],
                  ['twapEnd - twapStart >= 24 hours', 'Requires historical yield observation (not spot)'],
                  ['block.timestamp - twapEnd <= 2 hours', 'Prevents using outdated TWAP data'],
                  ['status == 1', 'Rejects failed FCC actions before decoding their data'],
                  ['ECDSA.recover(EIP-191(actionResultHash)) == teeAddress', 'Verifies the registered TEE signed the exact result data, ID and status'],
                ]}
              />

              <InfoCard type="warning" title="TEE Timeout & Emergency Fallback">
                If the TEE has been inactive for <strong>7 days</strong> (TEE_TIMEOUT), the vault owner (DAO multi-sig) can call <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">forceWithdrawAll()</code> to pull all capital from the active strategy back into idle balance. This ensures users can always withdraw even if the TEE goes offline permanently.
              </InfoCard>
            </div>

            <div id="slippage-protection" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Slippage Protection</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                Every withdrawal and rebalance operation enforces a <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">minAmountOut</code> parameter. If the actual amount received falls below this threshold, the transaction reverts with <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">SlippageExceeded</code>.
              </p>
              <CodeBlock language="solidity" code={`// During rebalance — both the adapter-reported AND balance-delta are checked
uint256 assetsWithdrawn = balanceAfter - balanceBefore;
if (assetsWithdrawn < payload.minAmountOut || adapterReported < payload.minAmountOut) {
    revert SlippageExceeded(payload.minAmountOut, assetsWithdrawn);
}

// Additionally, the vault verifies zero residual value in the old strategy
uint256 residualValue = IStrategyAdapter(previousStrategy).totalValue();
if (residualValue != 0) revert StrategyNotFullyWithdrawn(previousStrategy, residualValue);`} />

              <InfoCard type="tip" title="Fee-on-Transfer Protection">
                The vault's <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">_deposit()</code> override verifies that the actual FAsset balance increase matches the requested deposit amount exactly. This rejects fee-on-transfer tokens that could break the ERC-4626 share pricing invariant.
              </InfoCard>
            </div>

            <div id="upgradeability" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Upgradeability (UUPS)</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                The ParentVault uses the <strong>UUPS (Universal Upgradeable Proxy Standard)</strong> pattern. Upgrades are restricted to the <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">owner</code> (DAO multi-sig) via the <code className="px-1.5 py-0.5 rounded bg-[rgba(23,20,20,0.06)] text-[11px] font-mono">_authorizeUpgrade()</code> override.
              </p>
              <DocTable
                headers={['Security Measure', 'Implementation']}
                rows={[
                  ['Upgrade authorization', 'onlyOwner modifier on _authorizeUpgrade()'],
                  ['Reentrancy protection', 'OpenZeppelin ReentrancyGuard on all state-changing functions'],
                  ['Pausability', 'Pausable with owner-only pause/unpause for emergencies'],
                  ['Storage gap', 'uint256[42] __gap reserved for future storage layout changes'],
                ]}
              />
            </div>
          </section>

          {/* ═══ SMART CONTRACTS ═══ */}
          <section id="contracts" className="mb-16">
            <SectionHeader id="contracts" icon={<Code className="w-5 h-5" />} title="Smart Contracts" />

            <div id="contract-addresses" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Deployed Addresses</h3>
              <InfoCard type="info" title="Coston2 Testnet">
                All contracts are deployed on <strong>Flare Coston2 Testnet</strong> (Chain ID: 114). These are testnet contracts — do not send real assets.
              </InfoCard>
              <DocTable
                headers={['Contract', 'Address', 'Type']}
                rows={[
                  ['ParentVault', '0x0000...0000 (pending)', 'UUPS Proxy (ERC-4626)'],
                  ['FAssetAdapter', '0x0000...0000 (pending)', 'Ownable + Pausable'],
                  ['KineticStrategyAdapter', '0x0000...0000 (pending)', 'Strategy Adapter'],
                  ['EnosysStrategyAdapter', '0x0000...0000 (pending)', 'Strategy Adapter'],
                ]}
              />
            </div>

            <div id="contract-interfaces" className="mb-10">
              <h3 className="text-lg font-bold text-[#171414] mb-3 font-['Manrope',sans-serif]">Contract Interfaces</h3>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-4 font-['Hanken_Grotesk',sans-serif]">
                All contracts are verified on the Coston2 block explorer. The source code is open and available on GitHub.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {name: 'IParentVault', desc: 'Core vault interface — deposit, withdraw, rebalance, FAsset settlement'},
                  {name: 'IStrategyAdapter', desc: 'Standard adapter interface — deposit, withdraw, withdrawAll, totalValue'},
                  {name: 'IFAssetAdapter', desc: 'FAsset bridge interface — registerMintingTag, processDirectMint, settleDirectMint'},
                  {name: 'IKToken', desc: 'Kinetic kToken interface — mint, redeem, exchangeRateStored, balanceOf'},
                  {name: 'IEnosysRouter', desc: 'Enosys V3 swap router — exactInputSingle for DEX swaps'},
                  {name: 'IEnosysV3Pool', desc: 'Enosys V3 pool — observe() for TWAP oracle pricing'},
                ].map((iface, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white/60 border border-[rgba(23,20,20,0.06)]">
                    <code className="text-sm font-bold text-[#171414] font-mono">{iface.name}</code>
                    <p className="text-xs text-[#4A4A4A] mt-1 font-['Hanken_Grotesk',sans-serif]">{iface.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══ FAQ ═══ */}
          <section id="faq" className="mb-16">
            <SectionHeader id="faq" icon={<FileText className="w-5 h-5" />} title="Frequently Asked Questions" />
            <div className="space-y-4">
              {[
                {q: 'What assets can I deposit?', a: 'Flux supports any ERC-20 token on Flare as the vault\'s underlying asset. For cross-chain deposits, the FAsset system supports XRP, BTC, DOGE, and other non-smart-contract assets. The current testnet deployment uses FXRP and USDC.e.'},
                {q: 'How is yield generated?', a: 'Yield comes from the active strategy adapter. Kinetic Lending earns interest from borrowers on Kinetic Market (Compound-v2 fork). Enosys DEX LP earns trading fees from liquidity provision. The TEE automatically rebalances to the highest-yielding approved strategy.'},
                {q: 'Is Flux audited?', a: 'Flux is currently on Coston2 testnet. Smart contracts use battle-tested OpenZeppelin libraries (ERC-4626, UUPS, ReentrancyGuard, Pausable). A formal audit will be conducted before mainnet deployment.'},
                {q: 'What happens if the TEE goes offline?', a: 'If the TEE is inactive for 7 days, the DAO multi-sig can trigger an emergency withdrawal via forceWithdrawAll(), pulling all capital from the active strategy back to the vault\'s idle balance. Users retain full withdrawal access.'},
                {q: 'Can the DAO steal my funds?', a: 'No. The vault is non-custodial — the DAO owner can only approve/withdraw strategies, pause deposits, and trigger emergency withdrawals back to the vault (not to the DAO). Users always retain the ability to redeem their ERC-4626 shares for underlying assets.'},
                {q: 'Why are FAsset deposits asynchronous?', a: 'FAsset deposits require the Flare Data Connector to observe the cross-chain payment, generate a state proof, and trigger the FAsset mint. This process requires multiple block confirmations on the source chain and attestation on Flare, which takes 1-3 minutes on testnet.'},
                {q: 'What is the liquidity buffer?', a: 'The liquidity buffer (default: 5% or 500 bps) is the portion of assets kept in idle balance rather than deployed to the strategy. This ensures instant withdrawals for small-to-medium amounts without triggering a strategy unwind.'},
              ].map((item, i) => (
                <FAQItem key={i} question={item.q} answer={item.a} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

// ─── Helper Components ───

const SectionHeader: React.FC<{id: string; icon: React.ReactNode; title: string}> = ({icon, title}) => (
  <div className="mb-4">
    <div className="flex items-center gap-3 mb-2">
      <div className="w-10 h-10 rounded-xl bg-[#171414] flex items-center justify-center shadow-[0_0_12px_rgba(225,186,194,0.15)]">
        <span className="text-[#E1BAC2]">{icon}</span>
      </div>
      <h2 className="text-2xl font-extrabold text-[#171414] font-['Manrope',sans-serif]">{title}</h2>
    </div>
    <div className="flex items-center gap-3 ml-[3.25rem]">
      <div className="flex-1 h-px bg-gradient-to-r from-[rgba(225,186,194,0.3)] to-transparent" />
      <div className="w-1.5 h-1.5 bg-[#E1BAC2] rotate-45 shadow-[0_0_6px_rgba(225,186,194,0.4)]" />
    </div>
  </div>
);

const FAQItem: React.FC<{question: string; answer: string}> = ({question, answer}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white/60 border border-[rgba(23,20,20,0.06)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <span className="text-sm font-bold text-[#171414] font-['Manrope',sans-serif] pr-4">{question}</span>
        <motion.div animate={{rotate: open ? 90 : 0}} transition={{duration: 0.2}}>
          <ChevronRight className="w-4 h-4 text-[#E1BAC2] flex-shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{height: 0, opacity: 0}}
            animate={{height: 'auto', opacity: 1}}
            exit={{height: 0, opacity: 0}}
            transition={{duration: 0.25, ease: [0.16, 1, 0.3, 1]}}
          >
            <div className="px-5 pb-4 text-sm text-[#4A4A4A] leading-relaxed font-['Hanken_Grotesk',sans-serif] border-t border-[rgba(23,20,20,0.04)] pt-3">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
