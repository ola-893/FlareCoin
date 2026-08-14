import React from 'react';
import { motion } from 'motion/react';
import { TrendingDown, ShieldOff, Clock } from 'lucide-react';
import xrpImg from '../assets/images/xrp.webp';

export const ProblemSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-[#F5F5F3] px-3 pb-24 pt-8 sm:px-5">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#F5F5F3] to-transparent" />
      <div className="relative mx-auto max-w-7xl rounded-[28px] border border-white/45 bg-white/55 px-4 py-16 shadow-[0_30px_90px_rgba(30,30,30,0.08)] backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-[#171414]/20 text-[10px] font-mono font-bold text-[#171414] uppercase tracking-[0.2em] mb-4 bg-white/35">
            <TrendingDown className="w-3.5 h-3.5 text-[#E1BAC2]" />
            <span>THE PROBLEM</span>
          </div>

          <div className="flex items-center justify-center gap-4 mb-4">
            <img src={xrpImg} alt="XRP" className="w-14 h-14 sm:w-20 sm:h-20 object-contain drop-shadow-lg" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#171414] leading-tight mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Your XRP is <br />
            <span className="font-semibold text-[#4A4A4A]">just sitting there.</span>
          </h2>

          <p className="text-sm sm:text-base text-[#4A4A4A] leading-relaxed" style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
            XRP holders have few simple, non-custodial routes into DeFi yield. Flux uses Flare's FAssets and FDC to make the route inspectable end to end.
          </p>
        </motion.div>

        {/* Problem Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* Card 1: Can't earn yield */}
          <motion.div
            className="glass-panel p-8 rounded-2xl border border-[#171414]/15 shadow-soft-editorial bg-white/60"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <div className="w-12 h-12 rounded-full bg-[#E1BAC2]/10 flex items-center justify-center mb-6">
              <TrendingDown className="w-6 h-6 text-[#E1BAC2]" />
            </div>
            <h3 className="text-xl font-bold text-[#1E1E1E] mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
              No way to earn yield
            </h3>
            <p className="text-sm text-[#4A4A4A] leading-relaxed" style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
              XRP can sit idle in a wallet. Unlike ETH or stablecoins, there are fewer straightforward ways to put it to work in DeFi and earn passive income.
            </p>
          </motion.div>

          {/* Card 2: Trust issues */}
          <motion.div
            className="glass-panel p-8 rounded-2xl border border-[#171414]/15 shadow-soft-editorial bg-white/60"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          >
            <div className="w-12 h-12 rounded-full bg-[#E1BAC2]/10 flex items-center justify-center mb-6">
              <ShieldOff className="w-6 h-6 text-[#E1BAC2]" />
            </div>
            <h3 className="text-xl font-bold text-[#1E1E1E] mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
              You'd have to trust a middleman
            </h3>
            <p className="text-sm text-[#4A4A4A] leading-relaxed" style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
              The only options today require handing your crypto to a centralized bridge or custodian. If they go down or get hacked, your funds are at risk.
            </p>
          </motion.div>

          {/* Card 3: Slow and clunky */}
          <motion.div
            className="glass-panel p-8 rounded-2xl border border-[#171414]/15 shadow-soft-editorial bg-white/60"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          >
            <div className="w-12 h-12 rounded-full bg-[#E1BAC2]/10 flex items-center justify-center mb-6">
              <Clock className="w-6 h-6 text-[#E1BAC2]" />
            </div>
            <h3 className="text-xl font-bold text-[#1E1E1E] mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Deposits and withdrawals are slow
            </h3>
            <p className="text-sm text-[#4A4A4A] leading-relaxed" style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>
              Moving assets across chains takes time to settle. Without smart automation, you could be stuck waiting when you need your funds most.
            </p>
          </motion.div>

        </div>

      </div>
      </div>
    </section>
  );
};
