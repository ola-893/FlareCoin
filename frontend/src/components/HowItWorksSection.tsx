import React, { useState } from 'react';
import { ArrowRight, Layers, Lock, RefreshCw, Cpu, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import fluxYieldImg from '../assets/images/flux_yield_accumulation.webp';
import xrpImg from '../assets/images/xrp.webp';

export const STEPS = [
  {
    step: '01',
    title: 'Deposit',
    subtitle: 'Native XRP',
    description: 'Send native XRP to the FAssets Core Vault with your Flux destination tag. The payment is independently verified on Flare.',
    icon: Lock,
    detail: 'FDC proof verification—not a server watcher—authorizes your FXRP mint and vault deposit.'
  },
  {
    step: '02',
    title: 'Conversion',
    subtitle: 'Automatic & backed 1:1',
    description: 'Flux uses Flare\'s FAssets system to convert your deposit into a format that works with DeFi protocols — fully backed by your original coins.',
    icon: RefreshCw,
    detail: 'This happens automatically. You don\'t need to do anything — just deposit and Flux handles the rest.'
  },
  {
    step: '03',
    title: 'Earning starts',
    subtitle: 'Smart allocation',
    description: 'Your funds are put to work in yield-generating strategies on Flare. Flux automatically moves capital to the best available opportunities.',
    icon: Cpu,
    detail: 'Every move is cryptographically signed and verified. No unauthorized changes to your funds.'
  },
  {
    step: '04',
    title: 'Watch it grow',
    subtitle: 'Yield compounds over time',
    description: 'Your share value increases as yield builds up. The longer you hold, the more you earn. Withdraw whenever you want.',
    icon: Sparkles,
    detail: 'Withdrawals pull from available liquidity first, then from active strategies if needed.'
  }
];

interface HowItWorksSectionProps {
  onConnectWallet: () => void;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({ onConnectWallet }) => {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="how-it-works" className="py-24 bg-[#F5F5F3] border-t border-[#1E1E1E]/15 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-[#1E1E1E]/20 text-[10px] font-mono font-bold text-[#1E1E1E] uppercase tracking-[0.2em] mb-4 bg-white/40">
            <Layers className="w-3.5 h-3.5 text-[#E1BAC2]" />
            <span>HOW IT WORKS</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1E1E1E] leading-tight mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
            From deposit to earning, <br />
            <span className="font-semibold text-[#4A4A4A]">in four simple steps.</span>
          </h2>
          <p className="text-sm sm:text-base text-[#4A4A4A] leading-relaxed" style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
            Flux handles all the complexity behind the scenes. You deposit, and yield starts building automatically.
          </p>
        </motion.div>

        {/* Process Flow Image */}
        <motion.div
          className="mb-16 glass-panel rounded-3xl p-6 sm:p-8 border border-[#1E1E1E]/15 shadow-soft-editorial relative overflow-hidden bg-white/60"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1E1E1E]/10">
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-[#1E1E1E]">Visual Flow</h3>
            <span className="text-[10px] font-mono font-bold text-[#E1BAC2] bg-[#E1BAC2]/10 px-3 py-1 rounded-full border border-[#E1BAC2]/30">
              Coston2 Testnet
            </span>
          </div>

          <div className="w-full max-h-[380px] rounded-2xl overflow-hidden bg-[#F5F5F3] border border-[#1E1E1E]/15 flex items-center justify-center p-4 relative">
            <img src={fluxYieldImg} alt="Flux Yield Accumulation Flow" className="w-full h-auto max-h-[340px] object-contain" />
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 border border-[#1E1E1E]/10">
              <img src={xrpImg} alt="XRP" className="w-5 h-5 object-contain" />
              <span className="text-[10px] font-mono font-bold text-[#1E1E1E] uppercase">XRP</span>
            </div>
          </div>
        </motion.div>

        {/* Step Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isSelected = activeStep === idx;

            return (
              <motion.div
                key={s.step}
                onClick={() => setActiveStep(idx)}
                className={`cursor-pointer p-6 rounded-3xl transition-all duration-300 border ${
                  isSelected
                    ? 'bg-white border-[#1E1E1E] shadow-md scale-105'
                    : 'glass-panel border-[#1E1E1E]/15 hover:border-[#1E1E1E]'
                }`}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 * idx }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono font-bold text-[#E1BAC2] bg-[#E1BAC2]/10 px-2.5 py-1 rounded-full border border-[#E1BAC2]/20">
                    STEP {s.step}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[#E1BAC2]" />
                  </div>
                </div>

                <h4 className="text-base font-bold text-[#1E1E1E] mb-0.5" style={{ fontFamily: 'Manrope, sans-serif' }}>{s.title}</h4>
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E1BAC2] mb-2">{s.subtitle}</p>
                <p className="text-xs text-[#4A4A4A] leading-relaxed mb-4">{s.description}</p>

                <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/15 text-[11px] font-medium text-[#1E1E1E]">
                  {s.detail}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Action Trigger */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          <button
            onClick={onConnectWallet}
            className="px-8 py-3.5 rounded-full bg-[#1E1E1E] text-[#E1BAC2] text-[11px] font-semibold uppercase tracking-[0.2em] hover:bg-[#000000] transition-all shadow-md inline-flex items-center gap-3"
          >
            <span>Start Earning</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>

      </div>
    </section>
  );
};
