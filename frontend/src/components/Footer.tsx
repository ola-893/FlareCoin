import React from 'react';
import {useNavigate} from 'react-router-dom';
import logoUrl from '../assets/logo/logo.webp';

export const Footer: React.FC = () => {
  const navigate = useNavigate();
  return (
    <footer className="overflow-hidden border-t border-white/10 bg-[#111010] py-12 text-[#F5F5F3] sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="mb-14 grid grid-cols-1 gap-12 md:grid-cols-12">
          
          {/* Brand & Mission */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="FLux" className="h-11 w-auto object-contain brightness-0 invert" />
              <div>
                
                <span className="block text-[10px] font-mono font-bold tracking-[0.2em] text-[#E1BAC2] uppercase">
                  Flare DeFi Protocol
                </span>
              </div>
            </div>

            <p className="max-w-sm text-xs leading-relaxed text-white/80" style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
              Flux is a non-custodial yield optimization protocol on Flare Network. Its native-XRP route uses FDC-verified FAssets minting; FCC signs strategy-rebalance results. Currently deployed on Coston2 testnet.
            </p>

            <div className="flex items-center gap-3 pt-2">

            </div>
          </div>

          {/* Column 2: Architecture */}
          <div className="md:col-span-2 space-y-3 text-xs">
            <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">Architecture</h4>
            <ul className="space-y-2 text-white/80">
              <li><a href="#hero-disassembly" className="hover:text-[#E1BAC2]">ParentVault (ERC-4626)</a></li>
              <li><a href="#vaults" className="hover:text-[#E1BAC2]">Strategy Adapters</a></li>
              <li><a href="#how-it-works" className="hover:text-[#E1BAC2]">FAsset Direct Minting</a></li>
              <li><a href="#tee-security" className="hover:text-[#E1BAC2]">TEE Rebalancing</a></li>
            </ul>
          </div>

          {/* Column 3: Strategies */}
          <div className="md:col-span-2 space-y-3 text-xs">
            <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">Strategies</h4>
            <ul className="space-y-2 text-white/80">
              <li><a href="#vaults" className="hover:text-[#E1BAC2]">Kinetic Lending</a></li>
              <li><a href="#vaults" className="hover:text-[#E1BAC2]">Enosys DEX LP</a></li>
            </ul>
          </div>

          {/* Column 4: Security */}
          <div className="md:col-span-3 space-y-3 text-xs">
            <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">Security</h4>
            <p className="leading-relaxed text-white/80">
              UUPS upgradeable contracts with TEE-signed rebalancing, TWAP validation, and slippage protection. Deployed on Flare Coston2 testnet.
            </p>
           
          </div>

        </div>

        <div className="relative -mx-4 mb-8 flex h-[25vh] min-h-[100px] items-center justify-center sm:-mx-6 sm:h-[40vh] lg:-mx-8">
          <img
            src={logoUrl}
            alt="FLux"
            className="h-full w-full max-w-none  object-contain  scale-[1] lg:scale-[2]"
          />
        </div>

        {/* Bottom Rights */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/90 sm:flex-row">
          <span>© 2026 Flux. Flare Coston2 Testnet. All Rights Copy.</span>
          <div className="flex items-center gap-6 text-[11px]">
            <a href="#" className="hover:text-[#E1BAC2]">Terms of Service</a>
            <a href="#" className="hover:text-[#E1BAC2]">Privacy Policy</a>
            <button onClick={() => navigate('/docs')} className="hover:text-[#E1BAC2] cursor-pointer bg-transparent border-none p-0 text-inherit">Documentation</button>
          </div>
        </div>

      </div>
    </footer>
  );
};
