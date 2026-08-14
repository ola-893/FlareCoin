import React, { useRef, useEffect, useState } from 'react';
import { ArchitectureComponent } from '../types';
import { ArrowDown } from 'lucide-react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'motion/react';
import logoUrl from '../assets/logo/logo.webp';

// Import frame images (WebP format for ~97% size reduction)
const frameImages: Record<number, string> = {};
for (let i = 1; i <= 90; i++) {
  frameImages[i] = new URL(`../assets/hero_frame/${String(i).padStart(2, '0')}.webp`, import.meta.url).href;
}

// Preload radius: how many frames ahead/behind to preload around current frame
const PRELOAD_RADIUS = 5;
// Preloaded frame cache
const preloadedFrames = new Set<number>();

function preloadFrame(index: number) {
  if (preloadedFrames.has(index) || !frameImages[index]) return;
  preloadedFrames.add(index);
  const img = new Image();
  img.src = frameImages[index];
}

export const ARCHITECTURE_COMPONENTS: ArchitectureComponent[] = [
  {
    id: 'parent-vault',
    title: 'ParentVault Custody Layer',
    subtitle: 'Asset Encapsulation & FAsset Bridge',
    realSystemName: 'Outer Twisted Rope Shell',
    description: 'Non-custodial ERC-4626 vault holding FAssets (FXRP, USDC.e) with EIP-712 signed rebalancing and a configurable liquidity buffer.',
    xRatio: 0.22, yRatio: 0.38, minScroll: 0.58, maxScroll: 0.88,
    tag: 'Non-Custodial',
    technicalDetails: ['FDC XRPPayment Proofs', 'Atomic FXRP Vault Deposits', 'UUPS Upgradeable Proxy']
  },
  {
    id: 'strategy-adapters',
    title: 'Strategy Adapters & Rebalancer',
    subtitle: 'Dynamic Yield Optimization Engine',
    realSystemName: 'Glowing Hourglass & Gears',
    description: 'Strategy adapters for Kinetic lending and Enosys DEX, with FCC-signed rebalancing between strategies based on TWAP-validated conditions.',
    xRatio: 0.38, yRatio: 0.22, minScroll: 0.62, maxScroll: 0.88,
    tag: 'Auto-Compounding',
    technicalDetails: ['Kinetic Lending (Compound-v2 fork)', 'Enosys DEX V3 Swaps', 'JOULE Reward Harvesting']
  },
  {
    id: 'flare-yield-shares',
    title: 'Flux Token',
    subtitle: 'Non-Custodial ERC-20 Ownership',
    realSystemName: 'Central Locked Vault Door',
    description: 'ERC-4626 Flux tokens representing proportional ownership of the ParentVault assets, with yield accruing through strategy-level exchange rates.',
    xRatio: 0.62, yRatio: 0.68, minScroll: 0.65, maxScroll: 0.88,
    tag: 'ERC-20 Standard',
    technicalDetails: ['ERC-4626 Vault Standard', 'Configurable Liquidity Buffer', 'exchangeRateStored Pricing']
  },
  {
    id: 'fcc-tee-enclave',
    title: 'Flare Confidential Compute (FCC)',
    subtitle: 'Hardware TEE Signed Rebalancing',
    realSystemName: 'Right Enclave Lock Mechanism',
    description: 'EIP-712 typed-data signatures from the FCC signer authorize rebalances, with 24h TWAP windows, slippage guards, and replay-protected nonces.',
    xRatio: 0.78, yRatio: 0.38, minScroll: 0.68, maxScroll: 0.88,
    tag: 'TEE Hardware Enclave',
    technicalDetails: ['EIP-712 ECDSA Signatures', '24h TWAP Observation Window', '7-Day TEE Timeout Fallback']
  }
];

const STORY_BEATS = [
  { min: 0, word: 'Sealed' },
  { min: 0.28, word: 'Minted' },
  { min: 0.54, word: 'Deployed' },
  { min: 0.78, word: 'Authorized' }
];

interface HeroCanvasProps {
  onExploreClick: () => void;
  onConnectWallet: () => void;
}

export const HeroCanvas: React.FC<HeroCanvasProps> = ({ onExploreClick, onConnectWallet }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [frameIndex, setFrameIndex] = useState(1);
  const activeBeat = STORY_BEATS.reduce((current, beat) => (
    scrollProgress >= beat.min ? beat : current
  ), STORY_BEATS[0]);

  // Video scroll progress — drives frame sequence
  const { scrollYProgress: frameScrollProgress } = useScroll({
    target: videoRef,
    offset: ['start start', 'end end'],
  });

  // Parallax
  const bgParallaxY = useTransform(frameScrollProgress, [0, 1], ['0%', '-15%']);
  const bgParallaxScale = useTransform(frameScrollProgress, [0, 1], [1, 1.08]);

  // Line scale grows from edges toward center as user scrolls
  const lineScale = useTransform(frameScrollProgress, [0, 0.15], [0, 1]);

  useMotionValueEvent(frameScrollProgress, 'change', (latest) => {
    setScrollProgress(latest);
    setFrameIndex(Math.min(Math.max(Math.round(latest * 89) + 1, 1), 90));
  });

  // Progressive lazy loading — preload frames around current index
  useEffect(() => {
    // Preload first few frames immediately for initial scroll
    [1, 2, 3, 4, 5].forEach(preloadFrame);
  }, []);

  // When frameIndex changes, preload nearby frames
  useEffect(() => {
    const start = Math.max(1, frameIndex - PRELOAD_RADIUS);
    const end = Math.min(90, frameIndex + PRELOAD_RADIUS);
    for (let i = start; i <= end; i++) {
      preloadFrame(i);
    }
  }, [frameIndex]);

  return (
    <>
      {/* ===== SECTION 1: INTRO — Logo, Motto, Scroll Hint (normal flow, one viewport) ===== */}
      <section className="relative h-screen w-full flex flex-col items-center justify-center bg-[#F5F5F3] overflow-hidden">
        {/* Subtle radial gradient backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(250,250,248,0.96)_0%,rgba(245,245,243,0.76)_56%,rgba(235,235,232,0.90)_100%)]" />

        {/* Logo — large, responsive, dominant */}
        <motion.div
          className="relative flex flex-col items-center z-10"
          initial={{ opacity: 0, scale: 0.4, filter: 'blur(30px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <motion.img
            src={logoUrl}
            alt="Flux"
            className="w-[90vw] max-w-[900px] sm:w-[80vw] md:w-[70vw] lg:w-[60vw] h-auto object-contain drop-shadow-[0_16px_64px_rgba(23,20,20,0.12)]"
            draggable={false}
            animate={{
              filter: [
                'drop-shadow(0 0 0px rgba(225,186,194,0))',
                'drop-shadow(0 0 40px rgba(225,186,194,0.3))',
                'drop-shadow(0 0 0px rgba(225,186,194,0))',
              ],
            }}
            transition={{ duration: 3, ease: 'easeInOut', delay: 2.0, repeat: Infinity, repeatDelay: 2 }}
          />
        </motion.div>

        {/* Motto text — reveal animation (clip from bottom) */}
        <div className="mt-8 sm:mt-10 overflow-hidden z-10">
          <motion.p
            className="text-center text-lg sm:text-xl md:text-2xl font-bold tracking-[0.06em] text-[#000000]/50 max-w-lg px-6"
            style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 1.0 }}
          >
            Non-custodial native-XRP yield on Flare Coston2.
          </motion.p>
        </div>

        {/* Scroll hint — reveal animation (clip from bottom) */}
        <div className="mt-10 sm:mt-12 overflow-hidden z-10">
          <motion.div
            className="flex items-center gap-2.5"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 1.4 }}
          >
            <ArrowDown className="h-3.5 w-3.5 animate-bounce text-[#E1BAC2]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#000000]/50">
              Scroll to explore
            </span>
          </motion.div>
        </div>
      </section>

      {/* ===== SECTION 2: VIDEO SEQUENCE — Sticky scroll-driven frame animation ===== */}
      <div ref={videoRef} className="relative h-[350vh]">
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#F5F5F3]">

          {/* Background gradient with parallax */}
          <motion.div
            className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_36%,rgba(250,250,248,0.96)_0%,rgba(245,245,243,0.76)_56%,rgba(235,235,232,0.90)_100%)]"
            style={{ y: bgParallaxY, scale: bgParallaxScale, transformOrigin: '50% 36%' }}
          />

          {/* Full-bleed frame image */}
          <img
            src={frameImages[frameIndex]}
            alt={`Vault disassembly frame ${frameIndex}`}
            className="absolute inset-0 z-20 h-full w-full object-cover object-center mix-blend-normal"
            loading="eager"
            draggable={false}
          />

          {/* Overlays for depth */}
          <div className="absolute inset-0 z-30 bg-[radial-gradient(circle_at_50%_43%,rgba(255,255,255,0)_0%,rgba(245,245,243,0.04)_48%,rgba(30,30,30,0.12)_100%)]" />
          <div className="absolute inset-x-0 top-0 z-30 h-40 bg-gradient-to-b from-[#F5F5F3]/90 via-[#F5F5F3]/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-30 h-64 bg-gradient-to-t from-[#F5F5F3] via-[#F5F5F3]/80 to-transparent" />

          {/* Bottom converging lines with changing word */}
          <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center pb-8 sm:pb-12 px-4">

            {/* Converging lines + center word */}
            <div className="relative w-full max-w-4xl flex items-center h-16 sm:h-20 px-4">

              {/* Left line — fills space left of center */}
              <motion.div
                className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#171414]/40 to-[#171414]/60 origin-left"
                style={{ scaleX: lineScale }}
              />

              {/* Center diamond marker + changing word */}
              <div className="relative z-10 flex flex-col items-center px-6 sm:px-10">
                <div className="w-2 h-2 rotate-45 bg-[#E1BAC2] mb-3 shadow-[0_0_12px_rgba(225,186,194,0.4)]" />

                {/* Changing word */}
                <div className="relative h-10 sm:h-12 w-60 sm:w-80 flex items-center justify-center overflow-hidden">
                  {STORY_BEATS.map((beat) => (
                    <motion.span
                      key={beat.word}
                      className="absolute text-xl sm:text-3xl md:text-4xl font-black uppercase tracking-[0.12em] text-[#171414] whitespace-nowrap"
                      style={{ fontFamily: 'Manrope, sans-serif' }}
                      initial={false}
                      animate={{
                        opacity: activeBeat.word === beat.word ? 1 : 0,
                        y: activeBeat.word === beat.word ? 0 : 10,
                        scale: activeBeat.word === beat.word ? 1 : 0.9,
                      }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {beat.word}
                    </motion.span>
                  ))}
                </div>

                {/* Frame counter */}
                <p className="mt-2 text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-[#171414]/90">
                  {String(frameIndex).padStart(2, '0')} / 90
                </p>
              </div>

              {/* Right line — fills space right of center */}
              <motion.div
                className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-[#171414]/40 to-[#171414]/60 origin-right"
                style={{ scaleX: lineScale }}
              />
            </div>

            {/* Progress bar */}
            <div className="mt-4 w-full max-w-xs overflow-hidden rounded-full bg-[#171414]/10 h-[2px]">
              <motion.div
                className="h-full rounded-full bg-[#E1BAC2]"
                style={{ width: `${Math.max(scrollProgress * 100, 1)}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>

            {/* CTA buttons — appear at end */}
            {scrollProgress >= 0.93 && (
              <motion.div
                className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <button
                  onClick={onExploreClick}
                  className="rounded-full bg-[#171414] px-6 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#E1BAC2] shadow-md transition-all hover:bg-[#000000]"
                >
                  Explore Vaults
                </button>
                <button
                  onClick={onConnectWallet}
                  className="rounded-full border border-[#171414]/20 bg-white/75 px-6 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#171414] shadow-pink-glow backdrop-blur-md transition-all hover:bg-[#E1BAC2] hover:text-white"
                >
                  Deposit XRP / BTC
                </button>
              </motion.div>
            )}
          </div>

        </div>
      </div>
    </>
  );
};
