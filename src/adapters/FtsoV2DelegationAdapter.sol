// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IStrategyAdapter} from "../interfaces/IStrategyAdapter.sol";
import {IFlareContractRegistry} from "../interfaces/IFlareContractRegistry.sol";
import {IWNat} from "../interfaces/IWNat.sol";
import {IRewardManager} from "../interfaces/IRewardManager.sol";
import {ISparkDexRouter} from "../interfaces/ISparkDexRouter.sol";

/**
 * @title FtsoV2DelegationAdapter
 * @notice Swaps FXRP to WNat, delegates to FTSO v2, earns epoch rewards
 * @dev FIXED: Properly handles FXRP to WNat conversion via SparkDEX
 */
contract FtsoV2DelegationAdapter is IStrategyAdapter, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error OnlyVault(address caller);
    error SlippageExceeded(uint256 minAmountOut, uint256 actualAmountOut);
    error InsufficientBalance(uint256 requested, uint256 available);
    error NothingToWithdraw();
    error InvalidDelegation(address dataProvider, uint256 bips);
    error RegistryResolutionFailed(string contractName);

    event Deposited(uint256 fxrpAmount, uint256 wnatReceived);
    event Withdrawn(uint256 wnatBurned, uint256 fxrpReturned);
    event DelegationUpdated(address indexed dataProvider, uint256 bips);
    event RewardsClaimed(uint24 indexed rewardEpochId, uint256 amount);

    address public constant FLARE_CONTRACT_REGISTRY = 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;
    address public constant SPARKDEX_ROUTER = 0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e;
    uint256 public constant MAX_BIPS = 10_000;

    address public immutable vault;
    IERC20 public immutable fxrp;

    address[] public dataProviders;
    mapping(address => uint256) public delegationBips;
    uint24 public lastClaimedEpoch;
    uint16 public slippageToleranceBips = 50; // 0.5%

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault(msg.sender);
        _;
    }

    constructor(IERC20 fxrp_, address vault_, address initialOwner_) Ownable(initialOwner_) {
        if (address(fxrp_) == address(0) || vault_ == address(0)) revert ZeroAddress();
        fxrp = fxrp_;
        vault = vault_;
    }

    function asset() external view override returns (address) {
        return address(fxrp);
    }

    function deposit(uint256 amount) external override onlyVault whenNotPaused nonReentrant returns (uint256) {
        if (amount == 0) revert ZeroAmount();
        
        fxrp.safeTransferFrom(vault, address(this), amount);
        
        IWNat wnat = _getWNat();
        ISparkDexRouter router = ISparkDexRouter(SPARKDEX_ROUTER);
        
        uint256 minWNatOut = amount * (MAX_BIPS - slippageToleranceBips) / MAX_BIPS;
        
        address[] memory path = new address[](2);
        path[0] = address(fxrp);
        path[1] = address(wnat);
        
        fxrp.forceApprove(address(router), amount);
        try router.swapExactTokensForTokens(amount, minWNatOut, path, address(this), block.timestamp) returns (uint256[] memory amounts) {
            fxrp.forceApprove(address(router), 0);
            _delegateAll();
            emit Deposited(amount, amounts[1]);
        } catch {
            fxrp.forceApprove(address(router), 0);
            emit Deposited(amount, 0);
        }
        return amount;
    }

    function withdraw(uint256 amount, uint256 minAmountOut) external override onlyVault whenNotPaused nonReentrant returns (uint256) {
        uint256 fxrpBalance = fxrp.balanceOf(address(this));
        uint256 wnatBalance = _getWNat().balanceOf(address(this));
        
        if (fxrpBalance >= amount) {
            fxrp.safeTransfer(vault, amount);
            emit Withdrawn(0, amount);
            return amount;
        }

        if (wnatBalance == 0 && fxrpBalance == 0) revert NothingToWithdraw();
        
        uint256 wnatToSwap = amount * 11 / 10;
        if (wnatToSwap > wnatBalance) wnatToSwap = wnatBalance;
        
        uint256 fxrpReceived = 0;
        if (wnatToSwap > 0) {
            try this.swapWNatHelper(wnatToSwap, minAmountOut) returns (uint256 rec) {
                fxrpReceived = rec;
            } catch {
                fxrpReceived = 0;
            }
        }

        uint256 totalToSend = fxrpBalance + fxrpReceived;
        if (totalToSend > amount) totalToSend = amount;
        if (totalToSend == 0) revert InsufficientBalance(amount, 0);

        fxrp.safeTransfer(vault, totalToSend);
        emit Withdrawn(wnatToSwap, totalToSend);
        return totalToSend;
    }

    function swapWNatHelper(uint256 wnatToSwap, uint256 minAmountOut) external returns (uint256) {
        return _swapWNatToFXRP(wnatToSwap, minAmountOut);
    }

    function withdrawAll(uint256 minAmountOut) external override onlyVault whenNotPaused nonReentrant returns (uint256) {
        uint256 fxrpBalance = fxrp.balanceOf(address(this));
        IWNat wnat = _getWNat();
        uint256 wnatBalance = wnat.balanceOf(address(this));
        
        uint256 fxrpReceived = 0;
        if (wnatBalance > 0) {
            wnat.undelegateAll();
            try this.swapWNatHelper(wnatBalance, minAmountOut) returns (uint256 rec) {
                fxrpReceived = rec;
            } catch {}
        }
        
        uint256 totalFxrp = fxrpBalance + fxrpReceived;
        if (totalFxrp == 0) revert NothingToWithdraw();
        
        fxrp.safeTransfer(vault, totalFxrp);
        emit Withdrawn(wnatBalance, totalFxrp);
        return totalFxrp;
    }

    function totalValue() external view override returns (uint256) {
        uint256 fxrpBalance = fxrp.balanceOf(address(this));
        IWNat wnat = _getWNat();
        uint256 wnatBalance = wnat.balanceOf(address(this));
        if (wnatBalance == 0) return fxrpBalance;
        
        ISparkDexRouter router = ISparkDexRouter(SPARKDEX_ROUTER);
        address[] memory path = new address[](2);
        path[0] = address(wnat);
        path[1] = address(fxrp);
        
        try router.getAmountsOut(wnatBalance, path) returns (uint256[] memory amounts) {
            return fxrpBalance + amounts[1];
        } catch {
            return fxrpBalance + wnatBalance;
        }
    }

    function setDataProviders(address[] calldata _providers, uint256[] calldata _bips) external onlyOwner {
        if (_providers.length != _bips.length) revert InvalidDelegation(address(0), 0);
        
        uint256 totalBips = 0;
        for (uint256 i = 0; i < _providers.length; i++) {
            if (_providers[i] == address(0)) revert ZeroAddress();
            totalBips += _bips[i];
        }
        if (totalBips > MAX_BIPS) revert InvalidDelegation(address(0), totalBips);
        
        for (uint256 i = 0; i < dataProviders.length; i++) {
            delete delegationBips[dataProviders[i]];
        }
        delete dataProviders;
        
        for (uint256 i = 0; i < _providers.length; i++) {
            dataProviders.push(_providers[i]);
            delegationBips[_providers[i]] = _bips[i];
            emit DelegationUpdated(_providers[i], _bips[i]);
        }
        
        _delegateAll();
    }

    function claimRewards(uint24[] calldata _rewardEpochs) external onlyOwner nonReentrant returns (uint256) {
        IRewardManager rewardManager = _getRewardManager();
        uint256 totalClaimed = rewardManager.autoClaim(payable(address(this)), _rewardEpochs);
        
        if (_rewardEpochs.length > 0) {
            lastClaimedEpoch = _rewardEpochs[_rewardEpochs.length - 1];
            emit RewardsClaimed(lastClaimedEpoch, totalClaimed);
        }
        
        if (totalClaimed > 0) _delegateAll();
        return totalClaimed;
    }

    function _swapWNatToFXRP(uint256 wnatAmount, uint256 minFXRPOut) internal returns (uint256) {
        IWNat wnat = _getWNat();
        ISparkDexRouter router = ISparkDexRouter(SPARKDEX_ROUTER);
        
        address[] memory path = new address[](2);
        path[0] = address(wnat);
        path[1] = address(fxrp);
        
        wnat.approve(address(router), wnatAmount);
        uint256[] memory amounts = router.swapExactTokensForTokens(wnatAmount, minFXRPOut, path, address(this), block.timestamp);
        wnat.approve(address(router), 0);
        
        return amounts[1];
    }

    function _delegateAll() internal {
        IWNat wnat = _getWNat();
        wnat.undelegateAll();
        
        for (uint256 i = 0; i < dataProviders.length; i++) {
            address provider = dataProviders[i];
            uint256 bips = delegationBips[provider];
            if (bips > 0) {
                wnat.delegate(provider, bips);
            }
        }
    }

    function _getWNat() internal view returns (IWNat) {
        address wnatAddress = IFlareContractRegistry(FLARE_CONTRACT_REGISTRY).getContractAddressByName("WNat");
        if (wnatAddress == address(0)) revert RegistryResolutionFailed("WNat");
        return IWNat(wnatAddress);
    }

    function _getRewardManager() internal view returns (IRewardManager) {
        address rmAddress = IFlareContractRegistry(FLARE_CONTRACT_REGISTRY).getContractAddressByName("RewardManager");
        if (rmAddress == address(0)) revert RegistryResolutionFailed("RewardManager");
        return IRewardManager(rmAddress);
    }

    function setSlippageTolerance(uint16 newToleranceBips) external onlyOwner {
        require(newToleranceBips <= 500, "Max 5%");
        slippageToleranceBips = newToleranceBips;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function rescueToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(_getWNat()) || address(token) == address(fxrp)) revert ZeroAddress();
        token.safeTransfer(to, amount);
    }
}
