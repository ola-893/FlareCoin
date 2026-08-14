import React, {useState, useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBalance} from 'wagmi';
import {decodeEventLog, parseUnits, formatUnits, type Hex} from 'viem';
import {motion, AnimatePresence} from 'motion/react';
import {Lock, RefreshCw, Check, ArrowRight, Copy, Clock, AlertCircle, Coins, ShieldCheck, Wallet, Zap} from 'lucide-react';
import xrpImg from '../assets/images/xrp.webp';
import btcImg from '../assets/images/btc.webp';
import {CONTRACTS, FASSET_ADAPTER_ABI, FDC_DIRECT_MINT_ADAPTER_ABI, FDC_HUB_ABI, ASSET_MANAGER_ABI, MINTING_TAG_MANAGER_ABI, PARENT_VAULT_ABI, FCE_CONFIG} from '../config/contracts';
import {checkFceHealth, waitForSignedRebalance} from '../services/fceClient';
import {FDC_REQUEST_FEE_MULTIPLIER, getFdcRequestFee, getXrpPaymentProof, isFdcVotingRoundFinalized, prepareXrpPaymentRequest, votingRoundForRequestBlock, type FdcXrpPaymentProof} from '../services/fdcClient';

type DepositFlow = 'FASSET' | 'ERC4626';
type FassetStep = 'SELECT' | 'RESERVE_TAG' | 'AWAITING_DEPOSIT' | 'READY_TO_SETTLE' | 'SETTLING' | 'DEPLOY' | 'COMPLETE';
type Erc4626Step = 'ERC4626_SELECT' | 'APPROVE' | 'APPROVING' | 'DEPOSIT' | 'DEPOSITING' | 'COMPLETE_CDP';
type DepositStep = FassetStep | Erc4626Step;
type FdcStatus = 'idle' | 'preparing' | 'prepared' | 'requesting' | 'waiting' | 'ready' | 'relaying' | 'deferred' | 'failed';

// Object-format ABI for decodeEventLog (human-readable strings don't work here)
const EVENT_ABI = [{
  type: 'event',
  name: 'MintingTagRegistered',
  inputs: [
    {indexed: true, name: 'tag', type: 'uint256'},
    {indexed: true, name: 'user', type: 'address'},
  ],
}] as const;

// Minimal ERC20 ABI for CDP token interactions
const ERC20_ABI = [
  {type:'function',name:'name',stateMutability:'view',inputs:[],outputs:[{name:'',type:'string'}]},
  {type:'function',name:'symbol',stateMutability:'view',inputs:[],outputs:[{name:'',type:'string'}]},
  {type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint8'}]},
  {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'allowance',stateMutability:'view',inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
] as const;

interface DepositPageProps {
  onBack: () => void;
}

/** Format wei as human-readable C2FLR (18 decimals) */
const formatC2FLR = (wei: bigint): string => {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return `${whole}.${fracStr}`;
};

const UNCONFIGURED_ADDRESS = '0x0000000000000000000000000000000000000000';

// Fetches the FAsset Core Vault XRPL address from Flare's AssetManager contract
const useCoreVaultAddress = () => {
  const {data: coreVaultAddress, isLoading, error} = useReadContract({
    address: CONTRACTS.assetManagerFXRP,
    abi: ASSET_MANAGER_ABI,
    functionName: 'directMintingPaymentAddress',
    query: {refetchInterval: false},
  });
  return {coreVaultAddress: coreVaultAddress as string | undefined, isLoading, error};
};

export const DepositPage: React.FC<DepositPageProps> = ({onBack}) => {
  const navigate = useNavigate();
  const {address, isConnected} = useAccount();
  const isFdcAdapterConfigured = CONTRACTS.fAssetAdapter.toLowerCase() !== UNCONFIGURED_ADDRESS;

  // Flow state
  const [depositFlow, setDepositFlow] = useState<DepositFlow>('FASSET');
  const [step, setStep] = useState<DepositStep>('SELECT');
  const [asset, setAsset] = useState<'XRP' | 'BTC'>('XRP');
  const [reservedTag, setReservedTag] = useState<string | null>(null);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [xrplTxHash, setXrplTxHash] = useState<string | null>(null);
  const [xrplAmount, setXrplAmount] = useState<string | null>(null);
  const [fdcStatus, setFdcStatus] = useState<FdcStatus>('idle');
  const [fdcRequestData, setFdcRequestData] = useState<Hex | null>(null);
  const [fdcRequestFee, setFdcRequestFee] = useState<bigint | null>(null);
  const [fdcRoundId, setFdcRoundId] = useState<bigint | null>(null);
  const [fdcProof, setFdcProof] = useState<FdcXrpPaymentProof | null>(null);
  const [fdcError, setFdcError] = useState<string | null>(null);

  // CDP-specific state
  const [cdpAmount, setCdpAmount] = useState('');
  const [cdpTxHash, setCdpTxHash] = useState<`0x${string}` | undefined>();

  // Always start at SELECT phase — but remember any previously saved tag.
  const [savedTag, setSavedTag] = useState<string | null>(null);
  // Tags registered after the FDC adapter migration may not appear in the
  // read-query cache until the next render/refetch. Keep that just-created tag
  // usable in this session, without treating arbitrary browser state as valid.
  const [registeredTagThisSession, setRegisteredTagThisSession] = useState<string | null>(null);
  // True while the pending tag registration is an "escape" to a brand-new tag
  // (used so a failed registration retries the same intent).
  const [isReservingNewTag, setIsReservingNewTag] = useState(false);

  // The FDC adapter leaves the tag executor open and instead binds every FDC
  // proof to the adapter. That removes the MintingTagManager executor-change
  // cooldown and, crucially, removes the watcher/operator key.
  const TAG_COOLDOWN_SECONDS = 0;
  const [tagCooldownDeadline, setTagCooldownDeadline] = useState<number | null>(null);
  const [tagCooldownRemaining, setTagCooldownRemaining] = useState(0);
  const [tagReady, setTagReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('flux-deposit-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.tag) {
          setSavedTag(parsed.tag);
        }
        // Restore cooldown state
        if (parsed.cooldownDeadline && parsed.cooldownDeadline > Date.now()) {
          setTagCooldownDeadline(parsed.cooldownDeadline);
          setTagCooldownRemaining(Math.max(0, Math.ceil((parsed.cooldownDeadline - Date.now()) / 1000)));
          setTagReady(false);
        } else if (parsed.cooldownDeadline && parsed.cooldownDeadline <= Date.now()) {
          // Cooldown expired while away
          setTagReady(true);
          setTagCooldownRemaining(0);
        } else if (parsed.step === 'AWAITING_DEPOSIT' && parsed.tag) {
          // Existing tag but no cooldown tracked — assume ready
          setTagReady(true);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Countdown timer for tag activation — deadline-driven so it reliably completes.
  // It ticks immediately (so a restored mid-cooldown deadline shows the right value
  // right away) and readiness is ALSO derived from the deadline in render, so the
  // cooldown card can never stay stuck even if a tick is throttled in a background tab.
  useEffect(() => {
    if (!tagCooldownDeadline) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((tagCooldownDeadline - Date.now()) / 1000));
      setTagCooldownRemaining(remaining);

      if (remaining <= 0) {
        if (interval) clearInterval(interval);
        setTagReady(true);
        // Update localStorage to mark as ready
        try {
          const saved = localStorage.getItem('flux-deposit-state');
          if (saved) {
            const parsed = JSON.parse(saved);
            parsed.tagReady = true;
            localStorage.setItem('flux-deposit-state', JSON.stringify(parsed));
          }
        } catch { /* ignore */ }
      }
    };

    interval = setInterval(tick, 1000);
    tick(); // Show the correct value immediately

    return () => { if (interval) clearInterval(interval); };
  }, [tagCooldownDeadline]);

  // A tag is ready once its activation cooldown deadline has passed. Derived from
  // the deadline (and remaining seconds) so the send-instructions always appear at
  // 0:00 — independent of any single state update being missed.
  // When no cooldown is tracked at all (e.g. reusing a tag reserved in a previous
  // session), the tag is already activated — treat it as ready immediately instead
  // of showing a stuck "Activating tag… 0s remaining" state.
  const isTagReady = tagReady
    || tagCooldownDeadline === null
    || Date.now() >= tagCooldownDeadline
    || tagCooldownRemaining <= 0;

  // ─── FAsset Flow Hooks ────────────────────────────────────────────────────
  const {data: userReservedTags, isLoading: isTagsLoading} = useReadContract({
    address: CONTRACTS.fAssetAdapter,
    abi: FDC_DIRECT_MINT_ADAPTER_ABI,
    functionName: 'getTagsForUser',
    args: address ? [address] : undefined,
    query: {enabled: !!address && isFdcAdapterConfigured && depositFlow === 'FASSET'},
  });
  const existingTags = (userReservedTags as bigint[] | undefined) ?? [];
  const hasExistingTag = existingTags.length > 0;

  // The tag this session deposits to: prefer the saved/active tag (if it is
  // still reserved on-chain), otherwise the first reserved tag.
  const candidateTag = useMemo(() => {
    if (savedTag && existingTags.some(t => t.toString() === savedTag)) return savedTag;
    return existingTags.length > 0 ? existingTags[0].toString() : null;
  }, [savedTag, existingTags]);

  // The previous watcher-based adapter used its own tags. A saved tag from that
  // contract (for example tag 438) must never be offered to the FDC adapter:
  // its direct-mint recipient is the retired contract, not this one.
  useEffect(() => {
    if (depositFlow !== 'FASSET' || isTagsLoading || !savedTag) return;
    if (existingTags.some(tag => tag.toString() === savedTag)) return;

    localStorage.removeItem('flux-deposit-state');
    setSavedTag(null);
    setTagCooldownDeadline(null);
    setTagCooldownRemaining(0);
    setTagReady(false);
  }, [depositFlow, existingTags, isTagsLoading, savedTag]);

  const candidatePendingAssets = undefined;

  const saveState = (s: DepositStep, tag?: string, depId?: string) => {
    localStorage.setItem('flux-deposit-state', JSON.stringify({
      step: s,
      tag: tag || reservedTag,
      asset,
      depositId: depId || depositId,
      depositFlow,
    }));
  };

  const {writeContract: registerTag, data: registerHash, isPending: isRegistering, error: registerError} = useWriteContract();
  const {isLoading: isRegisterConfirming, data: registerReceipt, error: registerReceiptError} = useWaitForTransactionReceipt({hash: registerHash});

  const {writeContract: settleMint, data: settleHash, isPending: isSettling, error: settleError} = useWriteContract();
  const {isLoading: isSettleConfirming, data: settleReceipt, error: settleReceiptError} = useWaitForTransactionReceipt({hash: settleHash});
  const [settleFailed, setSettleFailed] = useState<string | null>(null);
  const [wasSettling, setWasSettling] = useState(false);
  
  // Decode settlement errors (combines both local and upstream error handling)
  const [settlementErrorMessage, setSettlementErrorMessage] = useState<string | null>(null);
  
  useEffect(() => {
    if (settleError || settleReceiptError) {
      const error = settleError || settleReceiptError;
      const errorMsg = error?.message || String(error);
      
      // Decode custom Solidity errors
      if (errorMsg.includes('UnknownDirectMint')) {
        setSettlementErrorMessage('Deposit has not been processed on-chain by the executor yet. Please wait...');
      } else if (errorMsg.includes('InsufficientFAssetBalance')) {
        setSettlementErrorMessage('Adapter has not received FXRP tokens yet.');
      } else if (errorMsg.includes('UnknownPendingDeposit')) {
        setSettlementErrorMessage('ParentVault deposit queue pending.');
      } else {
        setSettlementErrorMessage(errorMsg.slice(0, 200));
      }
      setSettleFailed(errorMsg.slice(0, 200));
    }
  }, [settleError, settleReceiptError]);

  const {data: reservationFeeRaw, isLoading: isFeeLoading, error: feeError} = useReadContract({
    address: CONTRACTS.mintingTagManager,
    abi: MINTING_TAG_MANAGER_ABI,
    functionName: 'reservationFee',
    query: {retry: 2, staleTime: 30_000},
  });
  const reservationFee: bigint = (reservationFeeRaw as bigint | undefined) ?? 0n;

  // Quote the live FAssets fees before the user sends XRP. The actual amount
  // is still calculated and enforced by AssetManager in the proof relay.
  const {data: directMintingFeeBipsRaw} = useReadContract({
    address: CONTRACTS.assetManagerFXRP,
    abi: ASSET_MANAGER_ABI,
    functionName: 'getDirectMintingFeeBIPS',
    query: {enabled: depositFlow === 'FASSET'},
  });
  const {data: directMintingMinimumFeeRaw} = useReadContract({
    address: CONTRACTS.assetManagerFXRP,
    abi: ASSET_MANAGER_ABI,
    functionName: 'getDirectMintingMinimumFeeUBA',
    query: {enabled: depositFlow === 'FASSET'},
  });
  const {data: directMintingExecutorFeeRaw} = useReadContract({
    address: CONTRACTS.assetManagerFXRP,
    abi: ASSET_MANAGER_ABI,
    functionName: 'getDirectMintingExecutorFeeUBA',
    query: {enabled: depositFlow === 'FASSET'},
  });
  const directMintingFeeBips = directMintingFeeBipsRaw as bigint | undefined;
  const directMintingMinimumFee = directMintingMinimumFeeRaw as bigint | undefined;
  const directMintingExecutorFee = directMintingExecutorFeeRaw as bigint | undefined;

  const {data: balanceData} = useBalance({address});
  const nativeBalance = balanceData?.value ?? 0n;
  const hasEnoughBalance = nativeBalance >= reservationFee;

  useEffect(() => {
    if (registerReceipt && !isRegisterConfirming && step === 'RESERVE_TAG') {
      try {
        let actualTag: string = '';
        for (const log of registerReceipt.logs) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decoded: any = decodeEventLog({
              abi: EVENT_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded?.eventName === 'MintingTagRegistered') {
              actualTag = decoded.args.tag.toString();
              break;
            }
          } catch (e) {
            // ignore logs that can't be decoded
          }
        }

        if (actualTag) {
          setReservedTag(actualTag);
          setRegisteredTagThisSession(actualTag);
          setStep('AWAITING_DEPOSIT');
          // Start cooldown timer
          const deadline = Date.now() + TAG_COOLDOWN_SECONDS * 1000;
          setTagCooldownDeadline(deadline);
          setTagReady(false);
          setTagCooldownRemaining(TAG_COOLDOWN_SECONDS);
          localStorage.setItem('flux-deposit-state', JSON.stringify({
            step: 'AWAITING_DEPOSIT',
            tag: actualTag,
            asset,
            depositId: null,
            depositFlow,
            cooldownDeadline: deadline,
            tagReady: false,
          }));
        } else {
          console.error('MintingTagRegistered event not found in receipt logs');
        }
      } catch (err) {
        console.error('Error parsing receipt:', err);
      }
    }
  }, [registerReceipt, isRegisterConfirming, step]);

  useEffect(() => {
    if (settleHash && !isSettleConfirming) {
      if (settleReceipt?.status === 'success') {
        setStep('DEPLOY');
        saveState('DEPLOY');
        setSettleFailed(null);
      } else {
        // Transaction reverted — stay on READY_TO_SETTLE so user can retry
        setSettleFailed(settleReceipt ? 'Transaction was mined but reverted on-chain.' : 'Transaction failed or was rejected.');
        setStep('READY_TO_SETTLE');
      }
      setWasSettling(false);
    }
  }, [settleHash, isSettleConfirming, settleReceipt]);

  // Detect wallet rejection: isSettling went true→false without a hash being set
  useEffect(() => {
    if (wasSettling && !isSettling && !settleHash && step === 'SETTLING') {
      // User rejected the transaction in their wallet
      setSettleFailed('Transaction was rejected in your wallet.');
      setStep('READY_TO_SETTLE');
      setWasSettling(false);
    }
  }, [isSettling, settleHash, wasSettling, step]);

  // Track when settling begins
  useEffect(() => {
    if (isSettling) setWasSettling(true);
  }, [isSettling]);

  const handleReserveTag = () => {
    if (!isFdcAdapterConfigured || asset !== 'XRP') return;
    setIsReservingNewTag(false);
    if (candidateTag) {
      setReservedTag(candidateTag);
      // A previously registered tag is already activated — skip the
      // fresh-registration cooldown (unless one is still counting down).
      if (!tagCooldownDeadline || tagCooldownDeadline <= Date.now()) setTagReady(true);
      saveState('AWAITING_DEPOSIT', candidateTag);
      setStep('AWAITING_DEPOSIT');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTag({
      address: CONTRACTS.fAssetAdapter,
      abi: FDC_DIRECT_MINT_ADAPTER_ABI as any,
      functionName: 'registerMintingTag',
      value: reservationFee,
      gas: 500_000n,
    } as any);
    setStep('RESERVE_TAG');
  };

  // Reserves a brand-new minting tag so a user who doesn't recognize an existing
  // pending deposit on their current tag can start a clean deposit flow instead.
  const handleReserveNewTag = () => {
    if (!isFdcAdapterConfigured || asset !== 'XRP') return;
    setIsReservingNewTag(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTag({
      address: CONTRACTS.fAssetAdapter,
      abi: FDC_DIRECT_MINT_ADAPTER_ABI as any,
      functionName: 'registerMintingTag',
      value: reservationFee,
      gas: 500_000n,
    } as any);
    setStep('RESERVE_TAG');
  };

  const handleSettle = () => {
    if (!depositId) return;
    if (!isDepositProcessedOnChain) {
      setSettlementErrorMessage('Deposit has not been processed on-chain yet. Please wait for the executor...');
      return;
    }
    
    setSettlementErrorMessage(null); // Clear previous errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settleMint({
      address: CONTRACTS.fAssetAdapter,
      abi: FASSET_ADAPTER_ABI as any,
      functionName: 'settleDirectMint',
      args: [depositId as `0x${string}`],
    } as any);
    setStep('SETTLING');
  };

  // ─── FDC-verified native XRP mint ────────────────────────────────────────
  // The browser only prepares/retrieves public FDC data. It never decides
  // whether an XRPL payment is valid: the live AssetManager verifies the proof
  // on-chain inside executeFdcDirectMint before it can mint vault shares.
  const {writeContract: requestFdcAttestation, data: fdcRequestHash, isPending: isFdcRequesting, error: fdcRequestWriteError} = useWriteContract();
  const {data: fdcRequestReceipt, isLoading: isFdcRequestConfirming, isSuccess: isFdcRequestSuccess, error: fdcRequestReceiptError} = useWaitForTransactionReceipt({hash: fdcRequestHash});
  const {writeContract: relayFdcMint, data: fdcMintHash, isPending: isFdcMinting, error: fdcMintWriteError} = useWriteContract();
  const {data: fdcMintReceipt, isLoading: isFdcMintConfirming, isSuccess: isFdcMintSuccess, error: fdcMintReceiptError} = useWaitForTransactionReceipt({hash: fdcMintHash});

  const handlePrepareFdcRequest = async (hash: string) => {
    const isCurrentAdapterTag = !!reservedTag && (
      registeredTagThisSession === reservedTag
      || existingTags.some(tag => tag.toString() === reservedTag)
    );
    if (!isCurrentAdapterTag) {
      setFdcStatus('failed');
      setFdcError('This saved minting tag belongs to the retired adapter. Return to deposit selection and reserve a fresh FDC tag before sending XRP.');
      return;
    }

    setFdcError(null);
    setFdcProof(null);
    setFdcRoundId(null);
    setXrplTxHash(hash.replace(/^0x/i, '').toUpperCase());
    setFdcStatus('preparing');
    try {
      const requestData = await prepareXrpPaymentRequest(hash, CONTRACTS.fAssetAdapter);
      const fee = await getFdcRequestFee(requestData);
      setFdcRequestData(requestData);
      setFdcRequestFee(fee);
      setFdcStatus('prepared');
    } catch (error) {
      setFdcStatus('failed');
      setFdcError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRequestFdcAttestation = () => {
    if (!fdcRequestData || fdcRequestFee === null) return;
    setFdcError(null);
    setFdcStatus('requesting');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestFdcAttestation({
      address: CONTRACTS.fdcHub,
      abi: FDC_HUB_ABI as any,
      functionName: 'requestAttestation',
      args: [fdcRequestData],
      value: fdcRequestFee,
    } as any);
  };

  useEffect(() => {
    if (!fdcRequestWriteError && !fdcRequestReceiptError) return;
    setFdcStatus('failed');
    const error = fdcRequestWriteError || fdcRequestReceiptError;
    setFdcError(error?.message || 'The FDC attestation request was not confirmed.');
  }, [fdcRequestWriteError, fdcRequestReceiptError]);

  useEffect(() => {
    if (!isFdcRequestSuccess || !fdcRequestReceipt || !fdcRequestData) return;
    let cancelled = false;
    votingRoundForRequestBlock(fdcRequestReceipt.blockNumber)
      .then((roundId) => {
        if (cancelled) return;
        setFdcRoundId(roundId);
        setFdcStatus('waiting');
      })
      .catch((error) => {
        if (cancelled) return;
        setFdcStatus('failed');
        setFdcError(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, [isFdcRequestSuccess, fdcRequestReceipt, fdcRequestData]);

  useEffect(() => {
    if (fdcStatus !== 'waiting' || !fdcRequestData || fdcRoundId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let availabilityMissesAfterFinalization = 0;

    const poll = async () => {
      try {
        const isFinalized = await isFdcVotingRoundFinalized(fdcRoundId);
        if (cancelled) return;
        if (!isFinalized) {
          timer = setTimeout(poll, 10_000);
          return;
        }

        const proof = await getXrpPaymentProof(fdcRequestData, fdcRoundId);
        if (cancelled) return;
        if (proof) {
          if (!reservedTag || proof.data.responseBody.destinationTag !== BigInt(reservedTag)) {
            throw new Error('The FDC proof destination tag does not match your reserved Flux tag.');
          }
          if (directMintingFeeBips !== undefined && directMintingMinimumFee !== undefined && directMintingExecutorFee !== undefined) {
            const received = proof.data.responseBody.receivedAmount;
            const percentageFee = (received * directMintingFeeBips) / 10_000n;
            const mintingFee = percentageFee > directMintingMinimumFee ? percentageFee : directMintingMinimumFee;
            if (received <= mintingFee + directMintingExecutorFee) {
              throw new Error(`This payment is too small after the live FAssets minting and executor fees. Send more than ${formatUnits(mintingFee + directMintingExecutorFee, 6)} XRP to this tag, then request a new attestation.`);
            }
          }
          setFdcProof(proof);
          setXrplAmount(formatUnits(proof.data.responseBody.receivedAmount, 6));
          setFdcStatus('ready');
          return;
        }

        availabilityMissesAfterFinalization += 1;
        if (availabilityMissesAfterFinalization >= 6) {
          setFdcStatus('prepared');
          setFdcError('FDC finalized this round without selecting the request. No additional XRP is needed: submit the FDC proof request again for this same transaction.');
          return;
        }
        timer = setTimeout(poll, 10_000);
      } catch (error) {
        if (cancelled) return;
        setFdcStatus('failed');
        setFdcError(error instanceof Error ? error.message : String(error));
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [fdcStatus, fdcRequestData, fdcRoundId, reservedTag, directMintingFeeBips, directMintingMinimumFee, directMintingExecutorFee]);

  const handleRelayFdcMint = () => {
    if (!fdcProof) return;
    setFdcStatus('relaying');
    setFdcError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    relayFdcMint({
      address: CONTRACTS.fAssetAdapter,
      abi: FDC_DIRECT_MINT_ADAPTER_ABI as any,
      functionName: 'executeFdcDirectMint',
      args: [fdcProof],
    } as any);
  };

  useEffect(() => {
    if (!fdcMintWriteError && !fdcMintReceiptError) return;
    setFdcStatus('failed');
    const error = fdcMintWriteError || fdcMintReceiptError;
    setFdcError(error?.message || 'The FDC proof relay was not confirmed.');
  }, [fdcMintWriteError, fdcMintReceiptError]);

  useEffect(() => {
    if (!isFdcMintSuccess || !fdcMintReceipt) return;
    let deferred = false;
    for (const log of fdcMintReceipt.logs) {
      try {
        const decoded = decodeEventLog({abi: FDC_DIRECT_MINT_ADAPTER_ABI, data: log.data, topics: log.topics});
        if (decoded.eventName === 'FdcDirectMintDeferred') deferred = true;
      } catch {
        // Ignore logs from other contracts in the same transaction.
      }
    }
    if (deferred) {
      setFdcStatus('deferred');
      return;
    }
    setFdcStatus('ready');
    setStep('DEPLOY');
    saveState('DEPLOY');
  }, [isFdcMintSuccess, fdcMintReceipt]);

  // FCC rebalance flow: the connected wallet creates the on-chain instruction,
  // then later relays the signed result after the public FCC proxy has produced it.
  const {writeContract: requestRebalance, data: rebalanceRequestHash, isPending: isRequestingRebalance, error: rebalanceRequestError} = useWriteContract();
  const {isLoading: isRebalanceRequestConfirming, isSuccess: isRebalanceRequestSuccess, error: rebalanceRequestReceiptError} = useWaitForTransactionReceipt({hash: rebalanceRequestHash});

  const {data: vaultTeeAddressRaw} = useReadContract({
    address: CONTRACTS.parentVault,
    abi: PARENT_VAULT_ABI,
    functionName: 'teeAddress',
  });
  const {refetch: refetchLastInstructionId} = useReadContract({
    address: CONTRACTS.parentVault,
    abi: PARENT_VAULT_ABI,
    functionName: 'lastInstructionId',
    query: {enabled: false},
  });

  // Write: permissionless relay of the signed FCC action result.
  const {writeContract: writeRebalance, data: rebalanceHash, isPending: isRebalancing, error: rebalanceError} = useWriteContract();
  const {isLoading: isRebalanceConfirming, isSuccess: isRebalanceSuccess, error: rebalanceReceiptError} = useWaitForTransactionReceipt({hash: rebalanceHash});

  const [isRequestingSignature, setIsRequestingSignature] = useState(false);
  const [pendingRebalanceRequest, setPendingRebalanceRequest] = useState(false);
  const [fceError, setFceError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  // Auto-route to Dashboard once yield strategy deployment confirms.
  // Split into two effects: the first flips deploySuccess, the second runs the
  // redirect. Putting the timer in the same effect as the setDeploySuccess(true)
  // state change would cancel it via the effect cleanup (deploySuccess is a
  // dependency), so the redirect never fired.
  useEffect(() => {
    if (rebalanceHash && isRebalanceSuccess && !deploySuccess) {
      setDeploySuccess(true);
    }
  }, [rebalanceHash, isRebalanceSuccess, deploySuccess]);

  useEffect(() => {
    if (!deploySuccess) return;
    const timer = setTimeout(() => navigate('/'), 2000);
    return () => clearTimeout(timer);
  }, [deploySuccess, navigate]);

  const handleDeployToStrategy = async () => {
    setIsRequestingSignature(true);
    setFceError(null);

    try {
      // Check the public result endpoint before opening the wallet. The vault,
      // not the browser, creates the FCC instruction and selects its input.
      const isHealthy = await checkFceHealth();
      if (!isHealthy) {
        throw new Error('Autonomous TEE engine is in background batch mode. Your deposit is already confirmed and shares are minted. Click "Skip for Now" or "Go to Dashboard" to view your position.');
      }

      setPendingRebalanceRequest(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requestRebalance({
        address: CONTRACTS.parentVault,
        abi: PARENT_VAULT_ABI as any,
        functionName: 'requestRebalance',
        value: FCE_CONFIG.instructionFeeWei,
      } as any);
    } catch (err) {
      console.error('[Deploy] Error:', err);
      setFceError(err instanceof Error ? err.message : String(err));
      setIsRequestingSignature(false);
      setPendingRebalanceRequest(false);
    }
  };

  useEffect(() => {
    if (!rebalanceRequestError && !rebalanceRequestReceiptError) return;
    const error = rebalanceRequestError || rebalanceRequestReceiptError;
    setFceError(error?.message || 'The rebalance request was not confirmed.');
    setIsRequestingSignature(false);
    setPendingRebalanceRequest(false);
  }, [rebalanceRequestError, rebalanceRequestReceiptError]);

  useEffect(() => {
    if (!pendingRebalanceRequest || !isRebalanceRequestSuccess || !rebalanceRequestHash) return;

    const teeAddress = vaultTeeAddressRaw as `0x${string}` | undefined;
    if (!teeAddress || teeAddress === '0x0000000000000000000000000000000000000000') {
      setFceError('The vault has no active TEE machine configured.');
      setIsRequestingSignature(false);
      setPendingRebalanceRequest(false);
      return;
    }

    let cancelled = false;
    const relaySignedResult = async () => {
      try {
        const response = await refetchLastInstructionId();
        const instructionId = response.data as `0x${string}` | undefined;
        if (!instructionId || instructionId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          throw new Error('The rebalance request was confirmed but no FCC instruction ID was recorded.');
        }

        const teeResult = await waitForSignedRebalance(instructionId, teeAddress);
        if (cancelled) return;

        // The contract independently verifies this exact signature and signer.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        writeRebalance({
          address: CONTRACTS.parentVault,
          abi: PARENT_VAULT_ABI as any,
          functionName: 'executeRebalance',
          args: [teeResult.resultData, teeResult.actionId, teeResult.submissionTag, teeResult.status, teeResult.signature],
        } as any);
      } catch (err) {
        if (!cancelled) {
          setFceError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsRequestingSignature(false);
          setPendingRebalanceRequest(false);
        }
      }
    };

    relaySignedResult();
    return () => { cancelled = true; };
  }, [pendingRebalanceRequest, isRebalanceRequestSuccess, rebalanceRequestHash, vaultTeeAddressRaw, refetchLastInstructionId, writeRebalance]);

  const handleSkipDeploy = () => {
    setStep('COMPLETE');
  };

  const handleCopyTag = () => {
    if (reservedTag) {
      navigator.clipboard.writeText(reservedTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const {coreVaultAddress, isLoading: isVaultLoading} = useCoreVaultAddress();
  const [vaultCopied, setVaultCopied] = useState(false);

  // Direct mints settle atomically with the FDC proof; no off-chain executor
  // poll or secondary settlement transaction is involved.
  const isDepositProcessedOnChain = false;
  const isPendingDirectMintLoading = false;

  // ─── CDP ERC-4626 Flow Hooks ──────────────────────────────────────────────

  // Read user's CDP token balance
  const {data: cdpBalanceRaw, refetch: refetchCdpBalance} = useReadContract({
    address: CONTRACTS.tokens.cdp,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {enabled: !!address && depositFlow === 'ERC4626'},
  });
  const cdpBalance = cdpBalanceRaw as bigint | undefined;

  // Read CDP token decimals
  const {data: cdpDecimalsRaw} = useReadContract({
    address: CONTRACTS.tokens.cdp,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: {enabled: depositFlow === 'ERC4626'},
  });
  const cdpDecimals = (cdpDecimalsRaw as number | undefined) ?? 18;

  // Read CDP allowance
  const {data: cdpAllowanceRaw, refetch: refetchCdpAllowance} = useReadContract({
    address: CONTRACTS.tokens.cdp,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.vaults.cdpVault] : undefined,
    query: {enabled: !!address && depositFlow === 'ERC4626' && step === 'APPROVE'},
  });
  const cdpAllowance = cdpAllowanceRaw as bigint | undefined;

  // Read vault maxDeposit
  const {data: maxDepositRaw} = useReadContract({
    address: CONTRACTS.vaults.cdpVault,
    abi: PARENT_VAULT_ABI,
    functionName: 'maxDeposit',
    args: address ? [address] : undefined,
    query: {enabled: !!address && depositFlow === 'ERC4626'},
  });
  const maxDeposit = maxDepositRaw as bigint | undefined;

  // Read vault totalAssets
  const {data: vaultTotalAssetsRaw} = useReadContract({
    address: CONTRACTS.vaults.cdpVault,
    abi: PARENT_VAULT_ABI,
    functionName: 'totalAssets',
    query: {enabled: depositFlow === 'ERC4626'},
  });
  const vaultTotalAssets = vaultTotalAssetsRaw as bigint | undefined;

  // Parse user input to bigint
  const parsedCdpAmount = useMemo(() => {
    if (!cdpAmount || cdpAmount === '' || cdpAmount === '0') return 0n;
    try {
      return parseUnits(cdpAmount, cdpDecimals);
    } catch {
      return 0n;
    }
  }, [cdpAmount, cdpDecimals]);

  // Preview shares for the deposit amount
  const {data: previewSharesRaw} = useReadContract({
    address: CONTRACTS.vaults.cdpVault,
    abi: PARENT_VAULT_ABI,
    functionName: 'previewDeposit',
    args: parsedCdpAmount > 0n ? [parsedCdpAmount] : undefined,
    query: {enabled: parsedCdpAmount > 0n && depositFlow === 'ERC4626'},
  });
  const previewShares = previewSharesRaw as bigint | undefined;

  // Check if approval is needed — when allowance is still loading, assume approval is needed
  const needsApproval = parsedCdpAmount > 0n && (cdpAllowance === undefined || cdpAllowance < parsedCdpAmount);

  // Write: Approve CDP to vault
  const {writeContract: approveCdp, data: approveHash, isPending: isApproving, error: approveError} = useWriteContract();
  const {isLoading: isApproveConfirming, error: approveReceiptError} = useWaitForTransactionReceipt({hash: approveHash});

  // Write: Deposit CDP to vault
  const {writeContract: depositCdp, data: depositHash, isPending: isDepositing, error: depositError} = useWriteContract();
  const {isLoading: isDepositConfirming} = useWaitForTransactionReceipt({hash: depositHash});

  const handleApproveCdp = () => {
    if (parsedCdpAmount <= 0n || !address) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approveCdp({
      address: CONTRACTS.tokens.cdp,
      abi: ERC20_ABI as any,
      functionName: 'approve',
      args: [CONTRACTS.vaults.cdpVault, parsedCdpAmount],
    } as any);
    setStep('APPROVING');
  };

  const handleDepositCdp = () => {
    if (parsedCdpAmount <= 0n || !address) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    depositCdp({
      address: CONTRACTS.vaults.cdpVault,
      abi: PARENT_VAULT_ABI as any,
      functionName: 'deposit',
      args: [parsedCdpAmount, address!],
    } as any);
    setStep('DEPOSITING');
  };

  // After approval confirms, move to deposit step
  useEffect(() => {
    if (approveHash && !isApproveConfirming && step === 'APPROVING') {
      refetchCdpAllowance();
      setStep('DEPOSIT');
    }
  }, [approveHash, isApproveConfirming, step, refetchCdpAllowance]);

  // After deposit confirms, move to complete
  useEffect(() => {
    if (depositHash && !isDepositConfirming && step === 'DEPOSITING') {
      setCdpTxHash(depositHash);
      refetchCdpBalance();
      setStep('COMPLETE_CDP');
    }
  }, [depositHash, isDepositConfirming, step, refetchCdpBalance]);

  const handleReset = () => {
    localStorage.removeItem('flux-deposit-state');
    setStep(depositFlow === 'ERC4626' ? 'ERC4626_SELECT' : 'SELECT');
    setReservedTag(null);
    setRegisteredTagThisSession(null);
    setDepositId(null);
    setCdpAmount('');
    setCdpTxHash(undefined);
    setTagCooldownDeadline(null);
    setTagCooldownRemaining(0);
    setTagReady(false);
    setFdcStatus('idle');
    setFdcRequestData(null);
    setFdcRequestFee(null);
    setFdcRoundId(null);
    setFdcProof(null);
    setFdcError(null);
  };

  const handleNewDeposit = () => {
    if (depositFlow === 'ERC4626') {
      setStep('ERC4626_SELECT');
      setCdpAmount('');
      setCdpTxHash(undefined);
    } else {
      setDepositId(null);
      setXrplTxHash(null);
      setXrplAmount(null);
      setTagCooldownDeadline(null);
      setTagCooldownRemaining(0);
      setTagReady(false);
      setFdcStatus('idle');
      setFdcRequestData(null);
      setFdcRequestFee(null);
      setFdcRoundId(null);
      setFdcProof(null);
      setFdcError(null);
      setStep('AWAITING_DEPOSIT');
      saveState('AWAITING_DEPOSIT');
    }
  };

  const switchToErc4626 = () => {
    setDepositFlow('ERC4626');
    setStep('ERC4626_SELECT');
  };

  const switchToFasset = () => {
    setDepositFlow('FASSET');
    setStep('SELECT');
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F5F5F3] flex items-center justify-center pt-24">
        <div className="text-center">
          <Lock className="w-16 h-16 text-[#4A4A4A] mx-auto mb-4" />
          <h2 className="text-2xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
            Connect your wallet
          </h2>
          <p className="text-sm text-[#4A4A4A] mb-6">Connect to start depositing</p>
          <button onClick={onBack} className="text-xs font-bold text-[#E1BAC2] hover:underline">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleCopyVaultAddress = () => {
    if (coreVaultAddress) {
      navigator.clipboard.writeText(coreVaultAddress);
      setVaultCopied(true);
      setTimeout(() => setVaultCopied(false), 2000);
    }
  };

  // Determine current step index for indicator
  const fassetSteps = ['SELECT', 'RESERVE_TAG', 'AWAITING_DEPOSIT', 'DEPLOY', 'COMPLETE'];
  const erc4626Steps = ['ERC4626_SELECT', 'APPROVE', 'DEPOSIT', 'COMPLETE_CDP'];
  const currentSteps = depositFlow === 'FASSET' ? fassetSteps : erc4626Steps;

  return (
    <div className="min-h-screen bg-[#F5F5F3] pt-24 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        {/* Back button */}
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold text-[#4A4A4A] hover:text-[#1E1E1E] transition-colors mb-8">
          ← Back to Dashboard
        </button>

        {/* Header */}
        <motion.div initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[10px] font-mono font-bold uppercase tracking-wider mb-3 bg-white/40">
            <Lock className="w-3 h-3 text-[#E1BAC2]" />
            <span>{depositFlow === 'ERC4626' ? 'ERC-4626 Direct Deposit' : 'FAsset Deposit Flow'}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
            {depositFlow === 'ERC4626' ? 'Deposit CDP Stablecoin' : 'Deposit Native Assets'}
          </h1>
          <p className="text-sm text-[#4A4A4A] mt-2">
            {depositFlow === 'ERC4626'
              ? 'Deposit CDP tokens directly into the vault to earn yield from Enosys V3 LP'
              : 'Send native XRP → FAssets verify it → Flux vault shares are issued'}
          </p>
        </motion.div>

        {/* Flow Toggle */}
        <div className="flex items-center gap-2 mb-8 p-1.5 rounded-2xl border border-[#1E1E1E]/15 bg-white/40">
          <button
            onClick={switchToFasset}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              depositFlow === 'FASSET'
                ? 'bg-[#1E1E1E] text-[#E1BAC2]'
                : 'text-[#4A4A4A] hover:text-[#1E1E1E]'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Native XRP
          </button>
          <button
            onClick={switchToErc4626}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              depositFlow === 'ERC4626'
                ? 'bg-[#1E1E1E] text-[#E1BAC2]'
                : 'text-[#4A4A4A] hover:text-[#1E1E1E]'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            CDP Deposit (ERC-4626)
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator steps={currentSteps} currentStep={step} />

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {/* ═══ FAsset Flow ═══ */}
          {depositFlow === 'FASSET' && step === 'SELECT' && (
            <StepSelectAsset
              key="select"
              asset={asset}
              setAsset={setAsset}
              onReserve={handleReserveTag}
              onReserveNewTag={handleReserveNewTag}
              isRegistering={isRegistering || isRegisterConfirming}
              isFeeLoading={isFeeLoading && !feeError}
              feeError={!!feeError}
              reservationFee={reservationFee}
              hasEnoughBalance={hasEnoughBalance}
              isTagsLoading={isTagsLoading}
              hasExistingTag={hasExistingTag}
              pendingTag={candidateTag}
              pendingAssets={candidatePendingAssets}
              isAdapterConfigured={isFdcAdapterConfigured}
            />
          )}

          {depositFlow === 'FASSET' && step === 'RESERVE_TAG' && (
            <StepReserving
              key="reserving"
              isConfirming={isRegisterConfirming}
              error={registerError?.message || registerReceiptError?.message}
              onRetry={isReservingNewTag ? handleReserveNewTag : handleReserveTag}
              onBack={() => setStep('SELECT')}
            />
          )}

          {depositFlow === 'FASSET' && step === 'AWAITING_DEPOSIT' && (
            <StepFdcDirectMint
              key="awaiting"
              tag={reservedTag!}
              coreVaultAddress={coreVaultAddress}
              isVaultLoading={isVaultLoading}
              onCopyTag={handleCopyTag}
              onCopyVaultAddress={handleCopyVaultAddress}
              vaultCopied={vaultCopied}
              copied={copied}
              xrplTxHash={xrplTxHash}
              fdcStatus={fdcStatus}
              fdcFee={fdcRequestFee}
              fdcFeeMultiplier={FDC_REQUEST_FEE_MULTIPLIER}
              fdcRoundId={fdcRoundId}
              fdcError={fdcError}
              isPreparing={fdcStatus === 'preparing'}
              isRequesting={isFdcRequesting || isFdcRequestConfirming}
              isRelaying={isFdcMinting || isFdcMintConfirming}
              onPrepare={handlePrepareFdcRequest}
              onRequestAttestation={handleRequestFdcAttestation}
              onRelayMint={handleRelayFdcMint}
              directMintingFeeBips={directMintingFeeBips}
              directMintingMinimumFee={directMintingMinimumFee}
              directMintingExecutorFee={directMintingExecutorFee}
            />
          )}

          {depositFlow === 'FASSET' && step === 'DEPLOY' && (
            <StepDeployToStrategy
              key="deploy"
              xrplAmount={xrplAmount}
              onDeploy={handleDeployToStrategy}
              onSkip={handleSkipDeploy}
              onGoToDashboard={onBack}
              isDeploying={isRebalancing || isRequestingRebalance || isRequestingSignature}
              isConfirming={isRebalanceRequestConfirming || isRebalanceConfirming}
              isSuccess={isRebalanceSuccess || deploySuccess}
              error={fceError || rebalanceError?.message || rebalanceReceiptError?.message}
              isRequestingSignature={isRequestingSignature}
            />
          )}

          {depositFlow === 'FASSET' && step === 'COMPLETE' && (
            <StepComplete key="complete" asset={asset} onReset={handleReset} onBack={onBack} onNewDeposit={handleNewDeposit} />
          )}

          {/* ═══ CDP ERC-4626 Flow ═══ */}
          {depositFlow === 'ERC4626' && step === 'ERC4626_SELECT' && (
            <StepCdpSelect
              key="cdp-select"
              cdpBalance={cdpBalance}
              cdpDecimals={cdpDecimals}
              cdpAmount={cdpAmount}
              setCdpAmount={setCdpAmount}
              maxDeposit={maxDeposit}
              vaultTotalAssets={vaultTotalAssets}
              previewShares={previewShares}
              needsApproval={needsApproval}
              onApprove={handleApproveCdp}
              onDeposit={handleDepositCdp}
              isProcessing={false}
              parsedCdpAmount={parsedCdpAmount}
            />
          )}

          {depositFlow === 'ERC4626' && step === 'APPROVING' && (
            <StepTxPending
              key="cdp-approving"
              title="Approving CDP spend"
              description="Confirm the token approval in your wallet. This allows the vault to pull your CDP tokens."
              isConfirming={isApproveConfirming}
              error={approveError?.message || approveReceiptError?.message}
              onRetry={handleApproveCdp}
              onBack={() => setStep('ERC4626_SELECT')}
            />
          )}

          {depositFlow === 'ERC4626' && step === 'DEPOSIT' && (
            <StepCdpSelect
              key="cdp-deposit"
              cdpBalance={cdpBalance}
              cdpDecimals={cdpDecimals}
              cdpAmount={cdpAmount}
              setCdpAmount={setCdpAmount}
              maxDeposit={maxDeposit}
              vaultTotalAssets={vaultTotalAssets}
              previewShares={previewShares}
              needsApproval={false}
              onApprove={handleApproveCdp}
              onDeposit={handleDepositCdp}
              isProcessing={false}
              approved={true}
              parsedCdpAmount={parsedCdpAmount}
            />
          )}

          {depositFlow === 'ERC4626' && step === 'DEPOSITING' && (
            <StepTxPending
              key="cdp-depositing"
              title="Depositing CDP"
              description="Depositing your CDP into the vault. Wait for on-chain confirmation..."
              isConfirming={isDepositConfirming}
              error={depositError?.message}
              onRetry={handleDepositCdp}
              onBack={() => setStep('DEPOSIT')}
            />
          )}

          {depositFlow === 'ERC4626' && step === 'COMPLETE_CDP' && (
            <StepCdpComplete
              key="cdp-complete"
              amount={cdpAmount}
              previewShares={previewShares}
              txHash={cdpTxHash}
              onReset={handleReset}
              onBack={onBack}
              onNewDeposit={handleNewDeposit}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

// ─── Step Indicator ─────────────────────────────────────────────────────────
const StepIndicator: React.FC<{steps: string[]; currentStep: string}> = ({steps, currentStep}) => {
  const labels: Record<string, string> = {
  'SELECT': 'Select',
  'RESERVE_TAG': 'Reserve Tag',
  'AWAITING_DEPOSIT': 'Verify XRP',
    'READY_TO_SETTLE': 'Settle',
    'SETTLING': 'Settling',
    'DEPLOY': 'Deploy',
    'COMPLETE': 'Complete',
    'ERC4626_SELECT': 'Amount',
    'APPROVE': 'Approve',
    'APPROVING': 'Approving',
    'DEPOSIT': 'Deposit',
    'DEPOSITING': 'Depositing',
    'COMPLETE_CDP': 'Complete',
  };

  // Deduplicate consecutive labels
  const uniqueSteps = steps.filter((s, i) => i === 0 || labels[s] !== labels[steps[i - 1]]);
  const currentIndex = uniqueSteps.indexOf(currentStep) !== -1
    ? uniqueSteps.indexOf(currentStep)
    : currentStep === 'APPROVING'
      ? uniqueSteps.indexOf('APPROVE')
      : currentStep === 'DEPOSITING'
        ? uniqueSteps.indexOf('DEPOSIT')
        : uniqueSteps.indexOf(currentStep);

  return (
    <div className="flex items-center justify-between mb-10 px-2">
      {uniqueSteps.map((s, i) => {
        const isActive = i <= currentIndex;
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all ${
                isActive ? 'bg-[#1E1E1E] text-[#F5F5F3]' : 'bg-[#1E1E1E]/10 text-[#4A4A4A]'
              }`}>
                {isActive && i < currentIndex ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] font-mono uppercase tracking-wider ${isActive ? 'text-[#1E1E1E] font-bold' : 'text-[#4A4A4A]'}`}>
                {labels[s]}
              </span>
            </div>
            {i < uniqueSteps.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${isActive ? 'bg-[#1E1E1E]' : 'bg-[#1E1E1E]/10'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── FAsset Step 1: Select Asset ────────────────────────────────────────────
const StepSelectAsset: React.FC<{
  asset: 'XRP' | 'BTC';
  setAsset: (a: 'XRP' | 'BTC') => void;
  onReserve: () => void;
  onReserveNewTag: () => void;
  isRegistering: boolean;
  isFeeLoading: boolean;
  feeError: boolean;
  reservationFee: bigint;
  hasEnoughBalance: boolean;
  isTagsLoading: boolean;
  hasExistingTag: boolean;
  pendingTag: string | null;
  pendingAssets: bigint | undefined;
  isAdapterConfigured: boolean;
}> = ({asset, setAsset, onReserve, onReserveNewTag, isRegistering, isFeeLoading, feeError, reservationFee, hasEnoughBalance, isTagsLoading, hasExistingTag, pendingTag, pendingAssets, isAdapterConfigured}) => (
  <motion.div
    initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
    className="glass-panel p-6 sm:p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
  >
    <h3 className="text-lg font-bold text-[#1E1E1E] mb-1" style={{fontFamily: 'Manrope, sans-serif'}}>
      Select deposit asset
    </h3>
    <p className="text-xs text-[#4A4A4A] mb-6">The current public route supports native XRP on XRPL Testnet.</p>

    <div className="grid grid-cols-2 gap-4 mb-8">
      <AssetOption
        name="XRP"
        img={xrpImg}
        description="Routed to FTSO v2 Delegation via FXRP"
        isSelected={asset === 'XRP'}
        onClick={() => setAsset('XRP')}
      />
      <AssetOption
        name="BTC"
        img={btcImg}
        description="Routed to Kinetic Lending via FBTC"
        isSelected={asset === 'BTC'}
        onClick={() => setAsset('BTC')}
        comingSoon={true}
      />
    </div>
    <div className="p-4 rounded-2xl bg-[#F5F5F3] border border-[#1E1E1E]/10 mb-6">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-[#4A4A4A] mt-0.5 shrink-0" />
        <p className="text-xs text-[#4A4A4A] leading-relaxed">
          This will reserve a unique minting tag on Flare. Send native XRP from your non-EVM wallet (for example, Xaman) using this tag. FAssets verifies the payment with FDC, mints FXRP, and the adapter deposits it into the ParentVault atomically.
        </p>
      </div>
    </div>

    {feeError && (
      <div className="p-3 rounded-xl bg-red-50 border border-red-200 mb-6">
        <p className="text-xs text-red-700">Could not load reservation fee from contract — proceeding with 0 value.</p>
      </div>
    )}

    {!feeError && !isFeeLoading && reservationFee > 0n && (
      <div className="p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10 mb-6">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#4A4A4A]">Tag Reservation Fee</span>
          <span className="font-mono font-bold text-[#1E1E1E]">{formatC2FLR(reservationFee)} C2FLR</span>
        </div>
        {!hasEnoughBalance && (
          <p className="text-[10px] text-red-600 mt-1 font-bold">Insufficient C2FLR balance for this transaction</p>
        )}
      </div>
    )}

    {hasExistingTag && (
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-6">
        <p className="text-xs text-emerald-700">
          <strong>Welcome back!</strong> You already have a reserved minting tag. Click below to go directly to your deposit instructions.
        </p>
      </div>
    )}

    {!isAdapterConfigured && (
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 mb-6">
        <p className="text-xs text-amber-800">The FDC direct-mint adapter has not been deployed to this build yet. Native XRP deposits are intentionally disabled.</p>
      </div>
    )}

    {pendingTag && pendingAssets !== undefined && pendingAssets > 0n && (
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 mb-6">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800">
            <div className="font-bold mb-1">
              Unclaimed deposit found on tag #{pendingTag}
            </div>
            <p className="text-[10px] leading-relaxed">
              {(Number(pendingAssets) / 1e6).toFixed(6)} FXRP was processed for this tag and is ready to
              settle. You can claim it below, or reserve a fresh tag for a new deposit.
            </p>
            <button
              onClick={onReserveNewTag}
              disabled={isRegistering}
              className="mt-2 text-[10px] font-bold text-amber-900 underline underline-offset-2 hover:text-amber-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              This isn't mine — reserve a new tag instead
            </button>
          </div>
        </div>
      </div>
    )}

    <button
      onClick={onReserve}
      disabled={!isAdapterConfigured || isRegistering || isTagsLoading || (!isFeeLoading && !hasEnoughBalance && reservationFee > 0n)}
      className="w-full py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
    >
      {isRegistering ? (
        <><RefreshCw className="w-4 h-4 animate-spin" /><span>Confirm in Wallet...</span></>
      ) : isFeeLoading || isTagsLoading ? (
        <><RefreshCw className="w-4 h-4 animate-spin" /><span>Loading...</span></>
      ) : (
        <><span>{hasExistingTag ? (pendingAssets && pendingAssets > 0n ? 'Settle & Claim Shares' : 'Continue to Deposit') : 'Reserve Minting Tag'}</span><ArrowRight className="w-4 h-4" /></>
      )}
    </button>
  </motion.div>
);

// ─── FAsset Step: Reserving Tag ─────────────────────────────────────────────
const StepReserving: React.FC<{
  isConfirming?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}> = ({isConfirming, error, onRetry, onBack}) => (
  <motion.div
    initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
    className="glass-panel p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60 text-center"
  >
    {!error ? (
      <>
        <div className="w-16 h-16 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center mx-auto mb-4 animate-spin">
          <RefreshCw className="w-8 h-8 text-[#E1BAC2]" />
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          {isConfirming ? 'Confirming transaction...' : 'Reserving your minting tag'}
        </h3>
        <p className="text-xs text-[#4A4A4A] mb-4">
          {isConfirming
            ? 'Transaction submitted. Waiting for on-chain confirmation...'
            : 'Confirm the transaction in your wallet. This registers a unique destination tag on Flare.'}
        </p>
      </>
    ) : (
      <>
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          Transaction Failed
        </h3>
        <p className="text-xs text-[#4A4A4A] mb-4">
          The minting tag reservation failed. This could be due to insufficient balance, a network issue, or a contract error.
        </p>
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 mb-6">
          <p className="text-xs text-red-700 font-mono break-all">{error}</p>
        </div>
        <div className="flex gap-3">
          {onBack && (
            <button onClick={onBack} className="flex-1 py-3 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] transition-all">
              Go Back
            </button>
          )}
          {onRetry && (
            <button onClick={onRetry} className="flex-1 py-3 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#000000] transition-all shadow-md">
              Try Again
            </button>
          )}
        </div>
      </>
    )}
  </motion.div>
);

// ─── FDC-native XRPL direct mint ───────────────────────────────────────────
const StepFdcDirectMint: React.FC<{
  tag: string;
  coreVaultAddress: string | undefined;
  isVaultLoading: boolean;
  onCopyTag: () => void;
  onCopyVaultAddress: () => void;
  vaultCopied: boolean;
  copied: boolean;
  xrplTxHash: string | null;
  fdcStatus: FdcStatus;
  fdcFee: bigint | null;
  fdcFeeMultiplier: bigint;
  fdcRoundId: bigint | null;
  fdcError: string | null;
  isPreparing: boolean;
  isRequesting: boolean;
  isRelaying: boolean;
  onPrepare: (hash: string) => void;
  onRequestAttestation: () => void;
  onRelayMint: () => void;
  directMintingFeeBips: bigint | undefined;
  directMintingMinimumFee: bigint | undefined;
  directMintingExecutorFee: bigint | undefined;
}> = ({tag, coreVaultAddress, isVaultLoading, onCopyTag, onCopyVaultAddress, vaultCopied, copied, xrplTxHash, fdcStatus, fdcFee, fdcFeeMultiplier, fdcRoundId, fdcError, isPreparing, isRequesting, isRelaying, onPrepare, onRequestAttestation, onRelayMint, directMintingFeeBips, directMintingMinimumFee, directMintingExecutorFee}) => {
  const [hashInput, setHashInput] = useState(xrplTxHash ?? '');
  const isWaiting = fdcStatus === 'waiting' || fdcStatus === 'requesting';
  const feeFloor = directMintingMinimumFee !== undefined && directMintingExecutorFee !== undefined
    ? directMintingMinimumFee + directMintingExecutorFee + 1n
    : undefined;

  return (
    <motion.div
      initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
      className="glass-panel p-6 sm:p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
    >
      <div className="text-center mb-7">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
          {isWaiting || isPreparing || isRelaying ? <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" /> : <ShieldCheck className="w-8 h-8 text-emerald-600" />}
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          FDC-verified XRP deposit
        </h3>
        <p className="text-xs text-[#4A4A4A]">
          No watcher or operator decides your deposit. Flare verifies the finalized XRPL payment proof on-chain before shares can be minted.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {feeFloor !== undefined && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-relaxed">
            Send more than <strong>{formatUnits(feeFloor, 6)} XRP</strong>. The live AssetManager deducts max({directMintingFeeBips !== undefined ? `${Number(directMintingFeeBips) / 100}%` : 'its percentage'}, {formatUnits(directMintingMinimumFee!, 6)} XRP) plus a {formatUnits(directMintingExecutorFee!, 6)} XRP relayer fee before vault shares are minted.
          </div>
        )}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
          <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs text-[#1E1E1E]">Send XRP from your XRPL wallet using these exact payment details:</p>
            
            {/* Core Vault Address Box */}
            <div className="p-3 rounded-lg bg-[#1E1E1E] text-[#F5F5F3]">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#E1BAC2] uppercase tracking-wider mb-1">
                <span>FAssets Core Vault Address (XRPL)</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[10px] font-mono break-all flex-1">{isVaultLoading ? 'Loading Core Vault…' : coreVaultAddress ?? 'Unable to load Core Vault'}</code>
                {coreVaultAddress && (
                  <button onClick={onCopyVaultAddress} title="Copy Core Vault Address" className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer shrink-0">
                    {vaultCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Destination Tag Box */}
            <div className="p-3 rounded-lg bg-[#1E1E1E] text-[#F5F5F3]">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#E1BAC2] uppercase tracking-wider mb-1">
                <span>Destination Tag</span>
                <span className="text-[9px] font-bold text-amber-300 font-mono">REQUIRED</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-mono font-extrabold tracking-wider text-white">{tag}</span>
                <button onClick={onCopyTag} title="Copy Destination Tag" className="p-1.5 px-2.5 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#E1BAC2]" />}
                  <span className="text-[10px] font-mono font-bold text-[#F5F5F3]">{copied ? 'Copied!' : 'Copy Tag'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
          <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#1E1E1E] mb-2">Paste the validated XRPL transaction hash.</p>
            <div className="flex gap-2">
              <input value={hashInput} onChange={(event) => setHashInput(event.target.value.trim())} placeholder="A603…C3124" className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-[#1E1E1E]/15 bg-white font-mono text-[10px]" />
              <button onClick={() => onPrepare(hashInput)} disabled={!hashInput || isPreparing} className="px-3 py-2 rounded-lg bg-[#1E1E1E] text-white text-[10px] font-bold disabled:opacity-50">
                {isPreparing ? 'Checking…' : 'Prepare proof'}
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
          <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
          <div className="flex-1">
            <p className="text-xs text-[#1E1E1E]">Request the FDC attestation, then relay its Merkle proof. The AssetManager performs the final verification and atomic vault deposit.</p>
            {fdcStatus === 'prepared' && fdcFee !== null && (
              <button onClick={onRequestAttestation} disabled={isRequesting} className="mt-3 w-full py-2.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider disabled:opacity-50">
                {isRequesting ? 'Confirming FDC request…' : `Request FDC proof (${fdcFeeMultiplier}× priority fee)`}
              </button>
            )}
            {fdcStatus === 'waiting' && (
              <div className="mt-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-950">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="relative flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping absolute" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  </div>
                  <span className="text-xs font-bold text-amber-900">
                    FDC Consensus in Progress (Voting Round {fdcRoundId?.toString() ?? '…'})
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/90 leading-relaxed mb-3">
                  Flare Data Connector validators are attesting your XRPL payment on-chain. FDC consensus rounds take ~90–180 seconds. This page will automatically retrieve the proof and unlock settlement as soon as finalization completes.
                </p>
                <div className="w-full bg-amber-200/50 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-amber-500 h-full w-full animate-pulse" />
                </div>
                <div className="flex justify-between items-center mt-2 text-[10px] font-mono text-amber-800/70">
                  <span>Status: Polling Flare Relay</span>
                  <span>Auto-advances on finalization</span>
                </div>
              </div>
            )}
            {fdcStatus === 'ready' && (
              <button onClick={onRelayMint} disabled={isRelaying} className="mt-3 w-full py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                {isRelaying ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>Relaying Verified Proof…</span></>
                ) : (
                  <><span>Mint FXRP & Receive Vault Shares</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            )}
            {fdcStatus === 'deferred' && (
              <button onClick={onRelayMint} disabled={isRelaying} className="mt-3 w-full py-3 rounded-xl bg-amber-600 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                {isRelaying ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>Retrying…</span></>
                ) : (
                  <><span>Retry After FAssets Rate Limit</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {fdcError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[10px] text-red-700 font-mono break-all">{fdcError}</div>}
      <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-mono text-[#4A4A4A]">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> FDC proof ownership is bound to the Flux adapter
        <button onClick={onCopyTag} className="ml-1 underline underline-offset-2">copy tag {copied ? '✓' : ''}</button>
      </div>
    </motion.div>
  );
};

// ─── FAsset Step: Awaiting Deposit ──────────────────────────────────────────
const StepAwaitingDeposit: React.FC<{
  tag: string;
  asset: 'XRP' | 'BTC';
  coreVaultAddress: string | undefined;
  isVaultLoading: boolean;
  onCopyTag: () => void;
  onCopyVaultAddress: () => void;
  vaultCopied: boolean;
  copied: boolean;
  cooldownRemaining: number;
  cooldownTotal: number;
  isReady: boolean;
}> = ({tag, asset, coreVaultAddress, isVaultLoading, onCopyTag, onCopyVaultAddress, vaultCopied, copied, cooldownRemaining, cooldownTotal, isReady}) => {
  const cooldownProgress = cooldownTotal > 0 ? ((cooldownTotal - cooldownRemaining) / cooldownTotal) * 100 : 100;
  const cooldownMinutes = Math.floor(cooldownRemaining / 60);
  const cooldownSeconds = cooldownRemaining % 60;

  return (
    <motion.div
      initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
      className="glass-panel p-6 sm:p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-[#E1BAC2]/10 border border-[#E1BAC2]/30 flex items-center justify-center mx-auto mb-4">
          {isReady ? (
            <Check className="w-8 h-8 text-emerald-500" />
          ) : (
            <Clock className="w-8 h-8 text-[#E1BAC2] animate-pulse" />
          )}
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          {isReady ? `Send native ${asset} to mint FAssets` : 'Activating your minting tag...'}
        </h3>
        <p className="text-xs text-[#4A4A4A]">
          {isReady
            ? `Your tag is ready. Send ${asset} from your non-EVM wallet using the tag below.`
            : 'Flare is activating your tag. Please wait before sending XRP.'}
        </p>
      </div>

      {/* Cooldown Timer */}
      {!isReady && (
        <div className="mb-6">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-800">Tag Activation Cooldown</span>
              </div>
              <span className="text-lg font-mono font-bold text-amber-900">
                {cooldownMinutes}:{cooldownSeconds.toString().padStart(2, '0')}
              </span>
            </div>
            <div className="w-full h-2 bg-amber-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-amber-500 rounded-full"
                initial={{width: 0}}
                animate={{width: `${cooldownProgress}%`}}
                transition={{duration: 0.5}}
              />
            </div>
            <p className="text-[10px] text-amber-700 mt-2">
              ⚠️ Do NOT send XRP until this timer reaches zero. Sending too early will cause your deposit to fail.
            </p>
          </div>
        </div>
      )}

      <div className="p-5 rounded-2xl bg-[#1E1E1E] text-[#F5F5F3] mb-6">
        <p className="text-[10px] font-mono text-[#E1BAC2] uppercase tracking-wider mb-2">Your Minting Tag</p>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-mono font-bold">{tag}</span>
          <button onClick={onCopyTag} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Instructions - only show when ready */}
      {isReady ? (
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
            <p className="text-xs text-[#1E1E1E]">Open your {asset === 'XRP' ? 'XRP ' : 'Bitcoin'} wallet</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
            <div className="flex-1">
              <p className="text-xs text-[#1E1E1E]">Send {asset} to the FAsset Core Vault with destination tag: <strong>{tag}</strong></p>
              <div className="mt-2 p-3 rounded-xl bg-[#1E1E1E] text-[#F5F5F3]">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-mono text-[#E1BAC2] uppercase tracking-wider">Core Vault Address ({asset === 'XRP' ? 'XRPL' : 'BTC'})</p>
                  <button onClick={onCopyVaultAddress} className="p-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors">
                    {vaultCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                {isVaultLoading ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#E1BAC2]" />
                    <span className="text-[10px] font-mono text-white/50">Fetching from AssetManager...</span>
                  </div>
                ) : coreVaultAddress ? (
                  <p className="text-[11px] font-mono font-bold break-all leading-relaxed">{coreVaultAddress}</p>
                ) : (
                  <p className="text-[10px] font-mono text-red-400">Unable to fetch address — check Flare AssetManager</p>
                )}
              </div>
              <p className="text-[10px] text-[#4A4A4A] mt-1.5">
                This is Flare's FAsset Direct Minting deposit address. Payments here are automatically routed to your vault via the destination tag.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10">
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
            <p className="text-xs text-[#1E1E1E]">Wait for FAsset attestation — this page will update automatically</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10 opacity-50">
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
            <p className="text-xs text-[#1E1E1E]">Open your {asset === 'XRP' ? 'XRP ' : 'Bitcoin'} wallet</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10 opacity-50">
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
            <p className="text-xs text-[#1E1E1E]">Send {asset} to the Core Vault (instructions will appear after cooldown)</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F3] border border-[#1E1E1E]/10 opacity-50">
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
            <p className="text-xs text-[#1E1E1E]">Wait for FAsset attestation</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-[#4A4A4A]">
        <span className="w-2 h-2 rounded-full bg-[#E1BAC2] animate-pulse" />
        {isReady ? 'Polling for deposit confirmation...' : `Activating tag... ${cooldownRemaining}s remaining`}
      </div>
    </motion.div>
  );
};

// ─── FAsset Step: Ready to Settle ───────────────────────────────────────────
const StepReadyToSettle: React.FC<{
  depositId: string;
  xrplTxHash: string | null;
  xrplAmount: string | null;
  asset: 'XRP' | 'BTC';
  tag?: string | null;
  onSettle: () => void;
  onReserveNewTag: () => void;
  isSettling: boolean;
  isDepositProcessedOnChain: boolean;
  isPendingDirectMintLoading: boolean;
  settlementError?: string | null;
  error?: string | null;
}> = ({depositId, xrplTxHash, xrplAmount, asset, tag, onSettle, onReserveNewTag, isSettling, isDepositProcessedOnChain, isPendingDirectMintLoading, settlementError, error}) => {
  const xrplExplorerUrl = xrplTxHash ? `https://testnet.xrpl.org/transactions/${xrplTxHash}` : null;
  const hasError = !!error;

  // Show "Awaiting Executor Processing" state if deposit not yet processed on-chain
  const isWaitingForExecutor = !isDepositProcessedOnChain;

  return (
    <motion.div
      initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
      className={`glass-panel p-6 sm:p-8 rounded-3xl shadow-soft-editorial bg-white/60 ${hasError ? 'border border-amber-400/40' : 'border border-emerald-500/30'}`}
    >
      <div className="text-center mb-8">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
          hasError ? 'bg-red-500/10 border border-red-400/30' : isWaitingForExecutor ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'
        }`}>
          {hasError ? (
            <AlertCircle className="w-8 h-8 text-red-600" />
          ) : isWaitingForExecutor ? (
            <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
          ) : (
            <Check className="w-8 h-8 text-emerald-600" />
          )}
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          {hasError ? 'Settlement Failed' : isWaitingForExecutor ? 'Awaiting Executor Processing...' : 'Deposit ready to settle'}
        </h3>
        <p className="text-xs text-[#4A4A4A]">
          {hasError
            ? 'The settlement transaction could not be completed. You can safely retry — your funds are still in the adapter.'
            : isWaitingForExecutor
              ? 'The executor is processing your XRPL deposit on-chain. This usually takes 15-30 seconds...'
              : tag
                ? `FXRP has been minted on-chain for your tag #${tag}. Settle to move it into your vault and receive Flux shares.`
                : 'Your deposit has been processed. Click below to settle and receive your Flux tokens.'}
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-[#F5F5F3] border border-[#1E1E1E]/10 mb-6 space-y-3">
        {xrplAmount && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">Amount</span>
            <span className="font-mono font-bold text-[#1E1E1E]">{xrplAmount} {asset === 'XRP' ? 'FXRP' : 'FBTC'}</span>
          </div>
        )}
        {tag && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">Minting Tag</span>
            <span className="font-mono font-bold text-[#1E1E1E]">#{tag}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#4A4A4A]">Deposit ID</span>
          <span className="font-mono text-[#1E1E1E]">{depositId.slice(0, 10)}...{depositId.slice(-6)}</span>
        </div>
        {xrplExplorerUrl && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">XRPL Transaction</span>
            <a href={xrplExplorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-emerald-700 hover:text-emerald-900 underline underline-offset-2 transition-colors">
              {xrplTxHash!.slice(0, 8)}...{xrplTxHash!.slice(-6)} ↗
            </a>
          </div>
        )}
        {isWaitingForExecutor && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 mt-3">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <div className="font-bold mb-1">Waiting for on-chain confirmation</div>
              <div className="text-[10px] leading-relaxed">
                The executor bot must call <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">processDirectMint()</code> before you can settle. 
                This happens automatically when your XRPL payment is detected. Polling every 3 seconds...
              </div>
            </div>
          </div>
        )}
      </div>

      {(error || settlementError) && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-700 font-bold">Settlement Failed</p>
              <p className="text-[10px] text-red-600 font-mono mt-1 break-all">{error || settlementError}</p>
              <p className="text-[10px] text-red-600 mt-1">You can safely retry — your funds are still in the adapter.</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onSettle} 
        disabled={isSettling || isWaitingForExecutor || isPendingDirectMintLoading}
        className="w-full py-3.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSettling ? (
          <><RefreshCw className="w-4 h-4 animate-spin" /><span>Settling Deposit...</span></>
        ) : isWaitingForExecutor ? (
          <><RefreshCw className="w-4 h-4 animate-spin" /><span>Awaiting Executor...</span></>
        ) : (
          <><span>{error ? 'Retry Settlement' : 'Settle & Receive Shares'}</span><ArrowRight className="w-4 h-4" /></>
        )}
      </button>

      {!isWaitingForExecutor && !hasError && !isSettling && (
        <div className="mt-4 pt-3 border-t border-[#1E1E1E]/10">
          <button
            onClick={onReserveNewTag}
            className="w-full text-[10px] font-bold text-[#4A4A4A] underline underline-offset-2 hover:text-[#1E1E1E] transition-colors"
          >
            This isn't my deposit — reserve a new tag
          </button>
          {tag && (
            <p className="text-[9px] text-center text-[#4A4A4A]/70 mt-1.5 font-mono">
              The deposit on tag #{tag} stays on-chain and remains available.
            </p>
          )}
        </div>
      )}

      {isWaitingForExecutor && (
        <p className="text-[9px] text-center text-[#4A4A4A] mt-3 font-mono">
          Checking on-chain status every 3 seconds...
        </p>
      )}
    </motion.div>
  );
};

// ─── FAsset Step: Settling ──────────────────────────────────────────────────
const StepSettling: React.FC<{onBack: () => void}> = ({onBack}) => (
  <motion.div
    initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
    className="glass-panel p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60 text-center"
  >
    <div className="w-16 h-16 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center mx-auto mb-4 animate-spin">
      <RefreshCw className="w-8 h-8 text-[#E1BAC2]" />
    </div>
    <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
      Settling your deposit
    </h3>
    <p className="text-xs text-[#4A4A4A] mb-6">
      Transferring FAssets to the ParentVault and minting your Flux tokens...
    </p>
    <button
      onClick={onBack}
      className="py-2.5 px-5 rounded-full border border-[#1E1E1E]/20 text-[#4A4A4A] text-[10px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] hover:text-[#1E1E1E] transition-all"
    >
      Cancel & Go Back
    </button>
  </motion.div>
);

// ─── FAsset Step: Deploy to Strategy ──────────────────────────────────────
const StepDeployToStrategy: React.FC<{
  xrplAmount: string | null;
  onDeploy: () => void;
  onSkip: () => void;
  onGoToDashboard: () => void;
  isDeploying: boolean;
  isConfirming: boolean;
  isSuccess?: boolean;
  error?: string | null;
  isRequestingSignature?: boolean;
}> = ({xrplAmount, onDeploy, onSkip, onGoToDashboard, isDeploying, isConfirming, isSuccess, error, isRequestingSignature}) => (
  <motion.div
    initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
    className="glass-panel p-6 sm:p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
  >
    <div className="text-center mb-8">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border transition-all ${
        isSuccess ? 'bg-emerald-100 border-emerald-300' : 'bg-[#E1BAC2]/10 border-[#E1BAC2]/30'
      }`}>
        {isSuccess ? <Check className="w-8 h-8 text-emerald-600" /> : <Zap className="w-8 h-8 text-[#E1BAC2]" />}
      </div>
      <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
        {isSuccess ? 'Deployed to FTSO v2 Delegation' : 'Deploy to Yield Strategy'}
      </h3>
      <p className="text-xs text-[#4A4A4A]">
        {isSuccess
          ? 'Your capital is live in the strategy and compounding automatically.'
          : 'Your FXRP is in the vault. Deploy it now to start earning yield automatically.'}
      </p>
    </div>

    {/* Success Banner */}
    {isSuccess && (
      <motion.div
        initial={{opacity: 0, y: 8}}
        animate={{opacity: 1, y: 0}}
        className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-300/60 mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>
              Strategy active — auto-compounding
            </p>
            <p className="text-[10px] font-mono text-[#4A4A4A] mt-0.5">
              Redirecting to Dashboard…
            </p>
          </div>
        </div>
      </motion.div>
    )}

    {/* Deposit Summary */}
    <div className="p-4 rounded-2xl bg-[#F5F5F3] border border-[#1E1E1E]/10 mb-6 space-y-3">
      {xrplAmount && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#4A4A4A]">FXRP Ready</span>
          <span className="font-mono font-bold text-[#1E1E1E]">{xrplAmount} FXRP</span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#4A4A4A]">Target Strategy</span>
        <span className="font-mono font-bold text-[#E1BAC2]">FTSO v2 Delegation</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#4A4A4A]">Projected APY</span>
        <span className="font-mono font-bold text-emerald-600">~3-8%</span>
      </div>
    </div>

    {/* How it works */}
    <div className="p-4 rounded-2xl bg-white/70 border border-[#1E1E1E]/15 mb-6">
      <p className="text-[10px] font-mono font-bold text-[#4A4A4A] uppercase tracking-wider mb-2">How it works</p>
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-[11px] text-[#4A4A4A]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E1BAC2] mt-1.5 shrink-0" />
          <span>Your wallet creates an on-chain FCC instruction; the active TEE machine signs its result.</span>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-[#4A4A4A]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E1BAC2] mt-1.5 shrink-0" />
          <span>The browser verifies the TEE signature against the vault, then your wallet relays the result.</span>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-[#4A4A4A]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E1BAC2] mt-1.5 shrink-0" />
          <span>The contract repeats the signature, nonce, deadline, and TWAP validation before moving funds.</span>
        </div>
      </div>
    </div>

    {error && !isSuccess && (
      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 mb-6 space-y-2">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-emerald-900" style={{fontFamily: 'Manrope, sans-serif'}}>
              Deposit Confirmed & Shares Minted
            </p>
            <p className="text-[11px] text-[#4A4A4A] leading-relaxed mt-1">
              {error}
            </p>
          </div>
        </div>
      </div>
    )}

    {isSuccess ? (
      <button
        onClick={onGoToDashboard}
        className="w-full py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
      >
        <Check className="w-4 h-4 text-emerald-400" />
        <span>Back to Dashboard</span>
      </button>
    ) : error ? (
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onSkip}
          className="py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4 text-emerald-400" />
          <span>View in Dashboard</span>
        </button>
        <button
          onClick={onDeploy}
          disabled={isDeploying || isConfirming}
          className="py-3.5 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] transition-all disabled:opacity-50"
        >
          {isRequestingSignature ? 'Checking…' : 'Retry Rebalance'}
        </button>
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onDeploy}
          disabled={isDeploying || isConfirming}
          className="py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isRequestingSignature ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /><span>Waiting for FCC Result...</span></>
          ) : isDeploying || isConfirming ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /><span>Confirm in Wallet...</span></>
          ) : (
            <><Zap className="w-4 h-4 text-[#E1BAC2]" /><span>Request FCC Rebalance</span></>
          )}
        </button>
        <button
          onClick={onSkip}
          className="py-3.5 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] transition-all"
        >
          Skip for Now
        </button>
      </div>
    )}
  </motion.div>
);

// ─── Auto-deploy Fallback Banner ─────────────────────────────────────────
const AutoDeployBanner: React.FC<{
  status: 'counting' | 'deploying' | 'success' | 'failed';
  remaining: number;
  error: string | null;
  totalSeconds: number;
  onCancel: () => void;
  onRetry: () => void;
}> = ({status, remaining, error, totalSeconds, onCancel, onRetry}) => {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = ((totalSeconds - remaining) / totalSeconds) * 100;

  const bgColor = {
    counting: 'bg-amber-50/90 border-amber-300/50',
    deploying: 'bg-blue-50/90 border-blue-300/50',
    success: 'bg-emerald-50/90 border-emerald-300/50',
    failed: 'bg-red-50/90 border-red-300/50',
  }[status];

  const textColor = {
    counting: 'text-amber-800',
    deploying: 'text-blue-800',
    success: 'text-emerald-800',
    failed: 'text-red-800',
  }[status];

  const subtextColor = {
    counting: 'text-amber-600',
    deploying: 'text-blue-600',
    success: 'text-emerald-600',
    failed: 'text-red-600',
  }[status];

  return (
    <motion.div
      initial={{opacity: 0, y: -20}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -20}}
      className={`rounded-2xl border p-4 mb-6 ${bgColor}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {status === 'counting' && <Clock className={`w-5 h-5 ${textColor} animate-pulse`} />}
          {status === 'deploying' && <RefreshCw className={`w-5 h-5 ${textColor} animate-spin`} />}
          {status === 'success' && <Check className={`w-5 h-5 ${textColor}`} />}
          {status === 'failed' && <AlertCircle className={`w-5 h-5 ${textColor}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className={`text-xs font-bold ${textColor}`}>
              {status === 'counting' && 'Auto-deploy in progress'}
              {status === 'deploying' && 'Deploying to strategy...'}
              {status === 'success' && 'Auto-deploy successful!'}
              {status === 'failed' && 'Auto-deploy failed'}
            </p>
            {status === 'counting' && (
              <span className="text-xs font-mono font-bold text-amber-700">
                {minutes}:{seconds.toString().padStart(2, '0')}
              </span>
            )}
          </div>

          {status === 'counting' && (
            <>
              <p className={`text-[11px] ${subtextColor} mb-2`}>
                Capital will be deployed to yield strategy automatically. You can cancel below.
              </p>
              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full bg-amber-200/50 mb-2">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-1000"
                  style={{width: `${progress}%`}}
                />
              </div>
              <button
                onClick={onCancel}
                className="text-[10px] font-bold text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors"
              >
                Cancel auto-deploy
              </button>
            </>
          )}

          {status === 'deploying' && (
            <p className={`text-[11px] ${subtextColor}`}>
              Requesting TEE signature and submitting rebalance transaction...
            </p>
          )}

          {status === 'success' && (
            <p className={`text-[11px] ${subtextColor}`}>
              Your FXRP has been deployed to the yield strategy. Check your dashboard for yield accrual.
            </p>
          )}

          {status === 'failed' && (
            <>
              <p className="text-[11px] text-red-600 mb-2 font-mono break-all">{error}</p>
              <button
                onClick={onRetry}
                className="text-[10px] font-bold text-red-700 underline underline-offset-2 hover:text-red-900 transition-colors"
              >
                Retry deploy
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── FAsset Step: Complete ──────────────────────────────────────────────────
const StepComplete: React.FC<{
  asset: 'XRP' | 'BTC';
  onReset: () => void;
  onBack: () => void;
  onNewDeposit: () => void;
}> = ({asset, onReset, onBack, onNewDeposit}) => (
  <motion.div
    initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
    className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/30 shadow-soft-editorial bg-white/60"
  >
    <div className="text-center mb-8">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="text-2xl font-extrabold text-[#1E1E1E] mb-1" style={{fontFamily: 'Manrope, sans-serif'}}>
        Deposit Complete!
      </h3>
      <p className="text-xs text-emerald-700 font-mono font-bold">
        Your Flux tokens are now accruing yield on Flare Coston2 testnet.
      </p>
    </div>

    <div className="p-4 rounded-2xl bg-white/70 border border-[#1E1E1E]/15 mb-6 text-xs space-y-2">
      <div className="flex justify-between">
        <span className="text-[#4A4A4A]">Asset:</span>
        <span className="font-bold text-[#1E1E1E]">{asset === 'XRP' ? 'FXRP → FTSO v2' : 'FBTC → Kinetic'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-[#4A4A4A]">Network:</span>
        <span className="font-mono text-emerald-700 font-bold">Flare Coston2 Testnet</span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <button onClick={onNewDeposit} className="py-3 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#000000] transition-all">
        Deposit Again (Same Tag)
      </button>
      <button onClick={onBack} className="py-3 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] transition-all">
        View Dashboard
      </button>
    </div>
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════
// CDP ERC-4626 Flow Components
// ═══════════════════════════════════════════════════════════════════════════

// ─── CDP Step: Select Amount & Deposit ──────────────────────────────────────
const StepCdpSelect: React.FC<{
  cdpBalance: bigint | undefined;
  cdpDecimals: number;
  cdpAmount: string;
  setCdpAmount: (v: string) => void;
  maxDeposit: bigint | undefined;
  vaultTotalAssets: bigint | undefined;
  previewShares: bigint | undefined;
  needsApproval: boolean;
  onApprove: () => void;
  onDeposit: () => void;
  isProcessing: boolean;
  approved?: boolean;
  parsedCdpAmount?: bigint;
}> = ({cdpBalance, cdpDecimals, cdpAmount, setCdpAmount, maxDeposit, vaultTotalAssets, previewShares, needsApproval, onApprove, onDeposit, isProcessing, approved, parsedCdpAmount: parsedAmount}) => {
  const formattedBalance = cdpBalance !== undefined ? formatUnits(cdpBalance, cdpDecimals) : '—';
  const formattedMaxDeposit = maxDeposit !== undefined
    ? maxDeposit > 10n ** 27n ? 'Unlimited' : formatUnits(maxDeposit, cdpDecimals)
    : '—';
  const formattedVaultTvl = vaultTotalAssets !== undefined ? formatUnits(vaultTotalAssets, cdpDecimals) : '—';
  const formattedShares = previewShares !== undefined ? formatUnits(previewShares, cdpDecimals) : '—';
  const hasBalance = cdpBalance !== undefined && cdpBalance > 0n;
  const hasAmount = cdpAmount && parseFloat(cdpAmount) > 0;
  const exceedsBalance = cdpBalance !== undefined && parsedAmount !== undefined && parsedAmount > 0n && parsedAmount > cdpBalance;
  const isValidAmount = hasAmount && !exceedsBalance && hasBalance;

  const handleMaxClick = () => {
    if (cdpBalance !== undefined) {
      setCdpAmount(formatUnits(cdpBalance, cdpDecimals));
    }
  };

  return (
    <motion.div
      initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
      className="glass-panel p-6 sm:p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60"
    >
      <h3 className="text-lg font-bold text-[#1E1E1E] mb-1" style={{fontFamily: 'Manrope, sans-serif'}}>
        {approved ? 'Confirm deposit' : 'Deposit CDP into vault'}
      </h3>
      <p className="text-xs text-[#4A4A4A] mb-6">
        {approved
          ? 'Your CDP is approved. Review and confirm the deposit.'
          : "Enter the amount of CDP you want to deposit. You'll approve the vault, then deposit in one flow."}
      </p>

      {/* Vault Info Card */}
      <div className="p-4 rounded-2xl bg-[#1E1E1E] text-[#F5F5F3] mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[#E1BAC2]/20 flex items-center justify-center">
            <Coins className="w-5 h-5 text-[#E1BAC2]" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{fontFamily: 'Manrope, sans-serif'}}>CDP Vault (fyCDP)</p>
            <p className="text-[10px] font-mono text-[#E1BAC2]">ERC-4626 · Enosys V3 LP</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Vault TVL</p>
            <p className="font-bold">{formattedVaultTvl} CDP</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Max Deposit</p>
            <p className="font-bold">{formattedMaxDeposit} CDP</p>
          </div>
        </div>
      </div>

      {/* Balance Display */}
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-[#4A4A4A]">Your CDP Balance</span>
        <span className="font-mono font-bold text-[#1E1E1E]">{formattedBalance} CDP</span>
      </div>
      {!hasBalance && cdpBalance !== undefined && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 mb-4">
          <p className="text-xs text-amber-700">
            You don't have any CDP tokens yet. Mint CDP on Enosys Loans using FXRP collateral, or acquire it from a DEX.
          </p>
        </div>
      )}

      {/* Amount Input */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs font-mono font-bold text-[#1E1E1E] mb-2">
          <span>Deposit Amount</span>
          <span className="text-[#4A4A4A]">CDP</span>
        </div>
        <div className="relative">
          <input
            type="number"
            value={cdpAmount}
            onChange={(e) => setCdpAmount(e.target.value)}
            disabled={approved}
            className="w-full bg-white border border-[#1E1E1E]/20 rounded-2xl px-4 py-3 text-lg font-bold text-[#1E1E1E] focus:outline-none focus:border-[#E1BAC2] disabled:opacity-60 disabled:cursor-not-allowed"
            placeholder="0.00"
            style={{fontFamily: 'Manrope, sans-serif'}}
            min="0"
            step="any"
          />
          <button
            onClick={handleMaxClick}
            disabled={approved}
            className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-[#E1BAC2]/20 text-[#8B6F75] text-[10px] font-mono font-bold hover:bg-[#E1BAC2]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            MAX
          </button>
        </div>
        {exceedsBalance && (
          <p className="text-[10px] text-red-600 mt-1 font-bold">Amount exceeds your CDP balance</p>
        )}
      </div>

      {/* Preview: Shares to receive */}
      {hasAmount && isValidAmount && previewShares !== undefined && (
        <div className="p-4 rounded-2xl bg-[#F5F5F3] border border-[#1E1E1E]/10 mb-6 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">CDP Deposited</span>
            <span className="font-mono font-bold text-[#1E1E1E]">{cdpAmount} CDP</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">fyCDP Shares You'll Receive</span>
            <span className="font-mono font-bold text-[#E1BAC2]">{parseFloat(formattedShares).toFixed(6)} fyCDP</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">Yield Source</span>
            <span className="font-mono text-[#4A4A4A]">Enosys V3 CDP/WC2FLR LP</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#4A4A4A]">Projected APY</span>
            <span className="font-mono font-bold text-emerald-600">~8-20%</span>
          </div>
        </div>
      )}

      {/* Approval Status */}
      {!needsApproval && approved && hasAmount && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-4">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-700 font-bold">CDP approved — ready to deposit</p>
        </div>
      )}

      {/* Action Button */}
      {needsApproval ? (
        <button
          onClick={onApprove}
          disabled={!isValidAmount || isProcessing}
          className="w-full py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4 text-[#E1BAC2]" />
          <span>Approve CDP Spend</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onDeposit}
          disabled={!isValidAmount || isProcessing}
          className="w-full py-3.5 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-[#000000] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Coins className="w-4 h-4 text-[#E1BAC2]" />
          <span>Deposit {cdpAmount || '0'} CDP → fyCDP</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );
};

// ─── CDP Generic: Transaction Pending ───────────────────────────────────────
const StepTxPending: React.FC<{
  title: string;
  description: string;
  isConfirming: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}> = ({title, description, isConfirming, error, onRetry, onBack}) => (
  <motion.div
    initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
    className="glass-panel p-8 rounded-3xl border border-[#1E1E1E]/15 shadow-soft-editorial bg-white/60 text-center"
  >
    {!error ? (
      <>
        <div className="w-16 h-16 rounded-full bg-[#1E1E1E] text-[#F5F5F3] flex items-center justify-center mx-auto mb-4 animate-spin">
          <RefreshCw className="w-8 h-8 text-[#E1BAC2]" />
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          {isConfirming ? 'Confirming...' : title}
        </h3>
        <p className="text-xs text-[#4A4A4A] mb-4">
          {isConfirming ? 'Transaction submitted. Waiting for on-chain confirmation...' : description}
        </p>
      </>
    ) : (
      <>
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-extrabold text-[#1E1E1E] mb-2" style={{fontFamily: 'Manrope, sans-serif'}}>
          Transaction Failed
        </h3>
        <p className="text-xs text-[#4A4A4A] mb-4">
          The transaction failed. This could be due to insufficient balance, a network issue, or a contract error.
        </p>
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 mb-6">
          <p className="text-xs text-red-700 font-mono break-all">{error}</p>
        </div>
        <div className="flex gap-3">
          {onBack && (
            <button onClick={onBack} className="flex-1 py-3 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] transition-all">
              Go Back
            </button>
          )}
          {onRetry && (
            <button onClick={onRetry} className="flex-1 py-3 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#000000] transition-all shadow-md">
              Try Again
            </button>
          )}
        </div>
      </>
    )}
  </motion.div>
);

// ─── CDP Step: Complete ─────────────────────────────────────────────────────
const StepCdpComplete: React.FC<{
  amount: string;
  previewShares: bigint | undefined;
  txHash: `0x${string}` | undefined;
  onReset: () => void;
  onBack: () => void;
  onNewDeposit: () => void;
}> = ({amount, previewShares, txHash, onReset, onBack, onNewDeposit}) => {
  const explorerUrl = txHash ? `https://coston2-explorer.flare.network/tx/${txHash}` : null;
  const formattedShares = previewShares ? formatUnits(previewShares, 18) : '—';

  return (
    <motion.div
      initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}}
      className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/30 shadow-soft-editorial bg-white/60"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-2xl font-extrabold text-[#1E1E1E] mb-1" style={{fontFamily: 'Manrope, sans-serif'}}>
          CDP Deposit Complete!
        </h3>
        <p className="text-xs text-emerald-700 font-mono font-bold">
          Your fyCDP tokens are now earning yield from Enosys V3 CDP/WC2FLR LP.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-white/70 border border-[#1E1E1E]/15 mb-6 text-xs space-y-2">
        <div className="flex justify-between">
          <span className="text-[#4A4A4A]">Deposited:</span>
          <span className="font-bold text-[#1E1E1E]">{amount} CDP</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#4A4A4A]">Vault Shares:</span>
          <span className="font-bold text-[#E1BAC2]">{parseFloat(formattedShares).toFixed(6)} fyCDP</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#4A4A4A]">Vault:</span>
          <span className="font-bold text-[#1E1E1E]">CDP Vault (Enosys V3 LP)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#4A4A4A]">Network:</span>
          <span className="font-mono text-emerald-700 font-bold">Flare Coston2 Testnet</span>
        </div>
        {explorerUrl && (
          <div className="flex justify-between">
            <span className="text-[#4A4A4A]">Tx:</span>
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-emerald-700 hover:text-emerald-900 underline underline-offset-2 transition-colors">
              {txHash!.slice(0, 8)}...{txHash!.slice(-6)} ↗
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onNewDeposit} className="py-3 rounded-full bg-[#1E1E1E] text-[#F5F5F3] text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#000000] transition-all">
          Deposit More
        </button>
        <button onClick={onBack} className="py-3 rounded-full border border-[#1E1E1E]/20 text-[#1E1E1E] text-[11px] font-bold uppercase tracking-[0.15em] hover:border-[#E1BAC2] transition-all">
          View Dashboard
        </button>
      </div>
    </motion.div>
  );
};

// ─── Asset Option Card ──────────────────────────────────────────────────────
const AssetOption: React.FC<{
  name: string;
  img: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
  comingSoon?: boolean;
}> = ({name, img, description, isSelected, onClick, comingSoon}) => (
  <button
    onClick={comingSoon ? undefined : onClick}
    disabled={comingSoon}
    className={`p-5 rounded-2xl border-2 transition-all text-left ${
      comingSoon
        ? 'border-[#1E1E1E]/10 bg-[#F5F5F3]/60 opacity-70 cursor-not-allowed'
        : isSelected
          ? 'border-[#1E1E1E] bg-white shadow-md'
          : 'border-[#1E1E1E]/10 bg-white/40 hover:border-[#1E1E1E]/30'
    }`}
  >
    <div className="flex items-center gap-3 mb-2">
      <img src={img} alt={name} className="w-8 h-8 object-contain" />
      <span className="text-base font-bold text-[#1E1E1E]" style={{fontFamily: 'Manrope, sans-serif'}}>{name}</span>
    </div>
    <p className="text-[11px] text-[#4A4A4A] mb-2">{description}</p>
    {comingSoon && (
      <span className="inline-block px-2 py-0.5 rounded-full bg-[#E1BAC2]/20 text-[#8B6F75] text-[9px] font-mono font-bold uppercase tracking-wider">
        Coming Soon
      </span>
    )}
  </button>
);
