import React, { useState } from 'react';
import { VaultInfo } from '../types';
import confetti from 'canvas-confetti';
import { Check, Sparkles, Lock, RefreshCw, X, Coins } from 'lucide-react';
import xrpImg from '../assets/images/xrp.webp';
import btcImg from '../assets/images/btc.webp';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVault?: VaultInfo;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  selectedVault
}) => {
  const [asset, setAsset] = useState<'XRP' | 'BTC' | 'CDP'>(selectedVault?.assetSymbol === 'CDP' ? 'CDP' : selectedVault?.assetSymbol === 'FXRP' ? 'BTC' : 'XRP');
  const [amount, setAmount] = useState<string>(asset === 'XRP' ? '2500' : '0.25');
  const [step, setStep] = useState<'INPUT' | 'MINTING' | 'CONFIRMED'>('INPUT');

  if (!isOpen) return null;

  const handleDeposit = () => {
    setStep('MINTING');

    setTimeout(() => {
      setStep('CONFIRMED');
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#E1BAC2', '#FFB3D9', '#1E1E1E', '#FFFFFF']
      });
    }, 1800);
  };

  const handleReset = () => {
    setStep('INPUT');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1E1E1E]/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#F5F5F3] border border-[#1E1E1E] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#1E1E1E] flex items-center justify-center text-[#F5F5F3] hover:bg-[#E1BAC2] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {step === 'INPUT' && (
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[10px] font-mono font-bold uppercase tracking-wider mb-3 bg-white/40">
              <Lock className="w-3 h-3 text-[#E1BAC2]" />
              <span>Non-Custodial Deposit</span>
            </div>

            <h3 className="text-2xl font-extrabold text-[#1E1E1E] mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Deposit into <span className="text-[#E1BAC2]">{asset === 'CDP' ? 'CDP Vault' : asset === 'XRP' ? 'FTSO v2' : 'Kinetic'}</span>
            </h3>
            <p className="text-xs text-[#4A4A4A] mb-6">
              {asset === 'CDP'
                ? 'Deposit CDP stablecoin into the vault via ERC-4626. Yields accrue from Enosys V3 CDP/WC2FLR LP.'
                : `Deposit ${asset === 'XRP' ? 'FXRP' : 'USDC.e'} into the ParentVault via a queue-settle flow. Yields accrue through strategy-level exchange rates.`}
            </p>

            {/* Asset Toggle */}
            <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl border border-[#1E1E1E]/15 bg-white/40 mb-6">
              <button
                onClick={() => {
                  setAsset('XRP');
                  setAmount('2500');
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  asset === 'XRP'
                    ? 'bg-[#1E1E1E] text-[#E1BAC2]'
                    : 'text-[#4A4A4A]'
                }`}
              >
                <img src={xrpImg} alt="" className="w-4 h-4 object-contain" />
                FTSO v2
              </button>
              <button
                onClick={() => {
                  setAsset('BTC');
                  setAmount('0.25');
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  asset === 'BTC'
                    ? 'bg-[#1E1E1E] text-[#E1BAC2]'
                    : 'text-[#4A4A4A]'
                }`}
              >
                <img src={btcImg} alt="" className="w-4 h-4 object-contain" />
                Kinetic
              </button>
              <button
                onClick={() => {
                  setAsset('CDP');
                  setAmount('1000');
                }}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  asset === 'CDP'
                    ? 'bg-[#1E1E1E] text-[#E1BAC2]'
                    : 'text-[#4A4A4A]'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                CDP Vault
              </button>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-[#1E1E1E] mb-2">
                <span>Deposit Amount</span>
                <span className="text-[#4A4A4A]">Connect wallet to see balance</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-white border border-[#1E1E1E]/20 rounded-2xl px-4 py-3 text-lg font-bold text-[#1E1E1E] focus:outline-none focus:border-[#1E1E1E]"
                  placeholder="0.00"
                  style={{ fontFamily: 'Manrope, sans-serif' }}
                />
                <button
                  disabled
                  className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-[#4A4A4A]/30 text-[#4A4A4A] text-[10px] font-mono font-bold cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Summary Box */}
            <div className="p-4 rounded-2xl bg-white/70 border border-[#1E1E1E]/15 mb-6 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[#4A4A4A]">
                <span>FAsset / Token:</span>
                <span className="font-bold text-[#1E1E1E]">{amount || 0} {asset === 'CDP' ? 'CDP' : asset === 'XRP' ? 'FXRP' : 'USDC.e'}</span>
              </div>
              <div className="flex items-center justify-between text-[#4A4A4A]">
                <span>Target Vault:</span>
                <span className="font-bold text-[#E1BAC2]">{asset === 'CDP' ? 'CDP Vault (Enosys V3 LP)' : asset === 'XRP' ? 'FTSO v2 Strategy' : 'Kinetic Strategy'}</span>
              </div>
              <div className="flex items-center justify-between text-[#4A4A4A]">
                <span>Vault Share Token:</span>
                <span className="font-bold text-[#1E1E1E]">{asset === 'CDP' ? 'fyCDP Token' : 'Flux Token'}</span>
              </div>
            </div>

            <button
              onClick={handleDeposit}
              className="w-full py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-[#E1BAC2]" />
              <span>Confirm Non-Custodial Deposit</span>
            </button>
          </div>
        )}

        {step === 'MINTING' && (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center mx-auto mb-4 animate-spin">
              <RefreshCw className="w-8 h-8 text-[#E1BAC2]" />
            </div>
            <h4 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>Processing Deposit Queue</h4>
            <p className="text-xs text-[#4A4A4A]">
              Queueing FAsset deposit and waiting for settlement confirmation on Flare Coston2 testnet...
            </p>
          </div>
        )}

        {step === 'CONFIRMED' && (
          <div className="py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>

            <h4 className="text-2xl font-extrabold text-[#1E1E1E] mb-1" style={{ fontFamily: 'Manrope, sans-serif' }}>Deposit Confirmed!</h4>
            <p className="text-xs text-emerald-700 font-mono font-bold mb-6">
              Your Flux tokens are now accruing yield on Flare Coston2 testnet.
            </p>

            <div className="p-4 rounded-2xl bg-white/70 border border-[#1E1E1E]/15 mb-6 text-xs text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-[#4A4A4A]">Deposited:</span>
                <span className="font-bold text-[#1E1E1E]">{amount} {asset === 'CDP' ? 'CDP' : asset === 'XRP' ? 'FXRP' : 'USDC.e'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4A4A4A]">Vault Shares:</span>
                <span className="font-bold text-[#E1BAC2]">{amount} {asset === 'CDP' ? 'fyCDP' : 'Flux'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4A4A4A]">Network:</span>
                <span className="font-mono text-[10px] text-emerald-700 font-bold">Flare Coston2 Testnet</span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#E1BAC2] transition-all"
            >
              Done & View Portfolio
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
