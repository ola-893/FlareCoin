// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {IParentVault} from "../interfaces/IParentVault.sol";
import {IStrategyAdapter} from "../interfaces/IStrategyAdapter.sol";
import {IInstructionSender} from "../interfaces/IInstructionSender.sol";
import {ITeeExtensionRegistry} from "../interfaces/ITeeExtensionRegistry.sol";

/**
 * @title ParentVault
 * @notice ERC-4626 Flux vault whose assets can be deployed through approved strategy adapters.
 * @dev Combines ERC-4626 vault shares (Flux Coins), FAsset direct-minting routing, and EIP-712 TEE rebalance execution.
 */
contract ParentVault is
    ERC4626Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    IParentVault
{
    using SafeERC20 for IERC20;

    uint16 public constant MAX_BPS = 10_000;
    uint256 public constant TEE_TIMEOUT = 7 days;
    uint256 public constant MIN_TWAP_WINDOW = 24 hours;
    uint256 public constant MAX_TWAP_AGE = 2 hours;

    // FCE Operation identifiers (plain strings, not hashed)
    bytes32 public constant OP_TYPE_VAULT_REBALANCE = bytes32("VAULT_REBALANCE");
    bytes32 public constant OP_COMMAND_CALCULATE_OPTIMAL = bytes32("CALCULATE_OPTIMAL");

    // TEE Action Result prefix (literal bytes32, NOT hashed)
    bytes32 private constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");

    error ZeroAddress();
    error UnauthorizedFAssetAdapter(address caller);
    error StrategyNotApproved(address strategy);
    error StrategyAssetMismatch(address strategy, address strategyAsset);
    error StrategyUnchanged();
    error InvalidNonce(uint256 expected, uint256 supplied);
    error RebalanceExpired(uint256 deadline, uint256 currentTimestamp);
    error InvalidTeeSignature(address recoveredSigner);
    error InvalidTwapWindow(uint256 twapStart, uint256 twapEnd);
    error StaleTwap(uint256 twapEnd, uint256 currentTimestamp);
    error SlippageExceeded(uint256 minAmountOut, uint256 actualAmountOut);
    error InsufficientLiquidity(uint256 required, uint256 available);
    error FallbackNotAvailable(uint256 availableAt);
    error PendingDepositAlreadyExists(bytes32 depositId);
    error UnknownPendingDeposit(bytes32 depositId);
    error InvalidLiquidityBuffer(uint16 bps);
    error InvalidAdapterDeposit(uint256 requested, uint256 actual);
    error UnexpectedAssetTransfer(uint256 expected, uint256 actual);
    error StrategyNotFullyWithdrawn(address strategy, uint256 residualValue);
    error FAssetDepositAlreadySettled(bytes32 depositId);
    error InsufficientIdleAssets(uint256 available, uint256 threshold);

    event StrategyApprovalUpdated(address indexed strategy, bool approved);
    event FccSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event FAssetAdapterUpdated(address indexed previousAdapter, address indexed newAdapter);
    event LiquidityBufferUpdated(uint16 previousBps, uint16 newBps);
    event FAssetDepositQueued(bytes32 indexed depositId, address indexed receiver);
    event FAssetDepositSettled(bytes32 indexed depositId, address indexed receiver, uint256 assets, uint256 shares);
    event EmergencyWithdrawal(address indexed strategy, uint256 assetsWithdrawn);
    event InstructionSenderUpdated(address indexed previousSender, address indexed newSender);
    event RebalanceRequested(bytes32 indexed instructionId, uint256 idleAssets, uint256 approvedStrategiesCount);
    event TeeAddressUpdated(address indexed previousTeeAddress, address indexed newTeeAddress);
    event ActiveStrategyReset(address indexed corruptedStrategy);

    // ═══════════════════════════════════════════════════════════════════════
    // STORAGE LAYOUT — ORIGINAL DEPLOYED ORDER (slots 0–5)
    // WARNING: DO NOT reorder, insert before, or remove these variables.
    // The proxy at 0x01f6...23B3 was initialized with this exact layout.
    // Any change to ordering will cause storage slot collisions.
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Authorized address for FCC/TEE rebalance attestations.  [SLOT 0]
    address public fccSigner;

    /// @notice Adapter allowed to create and settle asynchronous FAsset deposits.  [SLOT 1]
    address public fAssetAdapter;

    /// @notice Adapter currently holding the deployed capital, if any.  [SLOT 2]
    address public activeStrategy;

    /// @notice Replay-protection counter for FCC payloads.  [SLOT 3]
    uint256 public rebalanceNonce;

    /// @notice Time a valid FCC-signed rebalance was last executed.  [SLOT 4]
    uint256 public teeLastActive;

    /// @notice Share of assets retained locally for immediate ERC-4626 withdrawals.  [SLOT 5]
    uint16 public liquidityBufferBps;

    // ═══════════════════════════════════════════════════════════════════════
    // APPENDED VARIABLES — added post-deployment (slots 6+)
    // New variables MUST only be appended here, never inserted above.
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice TEE node signing address for action result verification.  [SLOT 6]
    address public teeAddress;

    /// @notice FCE Instruction Sender for triggering TEE rebalances.  [SLOT 7]
    address public instructionSender;

    /// @notice Last instruction ID generated (bytes32, not uint256).  [SLOT 8]
    bytes32 public lastInstructionId;

    /// @notice Minimum idle assets required to trigger automatic rebalance.  [SLOT 9]
    uint256 public rebalanceThreshold;

    mapping(address strategy => bool approved) public approvedStrategies;
    mapping(bytes32 depositId => address receiver) public pendingDepositReceiver;
    mapping(bytes32 depositId => bool settled) public settledFAssetDeposits;

    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes a UUPS proxy instance.
     * @param asset_ FAsset used as the ERC-4626 underlying asset.
     * @param name_ FlareYield ERC-20 name.
     * @param symbol_ FlareYield ERC-20 symbol.
     * @param initialOwner DAO multi-sig controlling upgrades and emergency fallback.
     * @param fccSigner_ TEE attestation signer for rebalances.
     * @param fAssetAdapter_ Direct-mint adapter allowed to settle queued deposits.
     * @param liquidityBufferBps_ Portion of liquid assets not deployed on each rebalance.
     */
    function initialize(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address fccSigner_,
        address fAssetAdapter_,
        uint16 liquidityBufferBps_
    ) external initializer {
        if (address(asset_) == address(0) || initialOwner == address(0) || fccSigner_ == address(0)) {
            revert ZeroAddress();
        }
        if (liquidityBufferBps_ > MAX_BPS) revert InvalidLiquidityBuffer(liquidityBufferBps_);

        __ERC20_init(name_, symbol_);
        __ERC4626_init(asset_);
        __Ownable_init(initialOwner);
        __Pausable_init();

        fccSigner = fccSigner_;
        fAssetAdapter = fAssetAdapter_;
        liquidityBufferBps = liquidityBufferBps_;
        teeLastActive = block.timestamp;
    }

    /**
     * @notice Total FAssets owned by shareholders, including idle assets and the active strategy value.
     * @dev Queued FAsset deposits are deliberately excluded: they remain at `fAssetAdapter` until settlement.
     */
    function totalAssets() public view override returns (uint256) {
        uint256 idleAssets = IERC20(asset()).balanceOf(address(this));
        address strategy = activeStrategy;
        return strategy == address(0) ? idleAssets : idleAssets + IStrategyAdapter(strategy).totalValue();
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     */
    function asset() public view override(ERC4626Upgradeable, IParentVault) returns (address) {
        return super.asset();
    }

    /// @notice Legacy-friendly alias for integrations built before the ERC-4626 upgrade.
    function totalUnderlyingValue() external view override returns (uint256) {
        return totalAssets();
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     */
    function deposit(uint256 assets, address receiver)
        public
        override(ERC4626Upgradeable, IParentVault)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     */
    function mint(uint256 shares, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override(ERC4626Upgradeable, IParentVault)
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @inheritdoc ERC4626Upgradeable
     */
    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Reserves an identifier for an FAsset direct-mint operation.
     * @dev No shares are minted until the FAsset system has minted the real, post-fee balance.
     */
    function queueFAssetDeposit(bytes32 depositId, address receiver) external override whenNotPaused {
        if (msg.sender != fAssetAdapter) revert UnauthorizedFAssetAdapter(msg.sender);
        if (receiver == address(0)) revert ZeroAddress();
        if (settledFAssetDeposits[depositId]) revert FAssetDepositAlreadySettled(depositId);
        if (pendingDepositReceiver[depositId] != address(0)) revert PendingDepositAlreadyExists(depositId);

        pendingDepositReceiver[depositId] = receiver;
        emit FAssetDepositQueued(depositId, receiver);
    }

    /**
     * @notice Settles a direct mint using the amount actually received after FAsset executor and minting fees.
     * @dev The FAsset adapter must approve this vault for exactly `assets`; this method pulls the assets and
     *      calculates shares before the transfer, preserving ERC-4626 pricing semantics.
     */
    function settleFAssetDeposit(bytes32 depositId, uint256 assets)
        external
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        if (msg.sender != fAssetAdapter) revert UnauthorizedFAssetAdapter(msg.sender);
        address receiver = pendingDepositReceiver[depositId];
        if (receiver == address(0)) revert UnknownPendingDeposit(depositId);

        delete pendingDepositReceiver[depositId];
        settledFAssetDeposits[depositId] = true;
        shares = previewDeposit(assets);
        _deposit(msg.sender, receiver, assets, shares);

        emit FAssetDepositSettled(depositId, receiver, assets, shares);
    }

    /**
     * @notice Trigger a TEE rebalance by sending instruction to FCE extension
     * @dev Can be called manually or automatically on deposit if threshold is met
     */
    function requestRebalance() public whenNotPaused {
        if (instructionSender == address(0)) return; // Silently skip if not configured
        
        uint256 idleAssets = IERC20(asset()).balanceOf(address(this));
        if (idleAssets < rebalanceThreshold) {
            revert InsufficientIdleAssets(idleAssets, rebalanceThreshold);
        }

        // Build approved strategies array
        address[] memory strategies = getApprovedStrategiesArray();
        
        // Encode rebalance request for FCE extension
        bytes memory message = abi.encode(
            address(this),
            idleAssets,
            strategies,
            liquidityBufferBps
        );

        // Build TeeInstructionParams
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE_VAULT_REBALANCE,
            opCommand: OP_COMMAND_CALCULATE_OPTIMAL,
            message: message,
            cosigners: new address[](0),
            cosignersThreshold: 0,
            claimBackAddress: address(this)
        });

        // Send instruction to TEE Extension Registry (returns bytes32 instructionId)
        bytes32 instructionId = IInstructionSender(instructionSender).sendInstructions(params);
        lastInstructionId = instructionId;

        emit RebalanceRequested(instructionId, idleAssets, strategies.length);
    }

    /**
     * @notice Get array of approved strategy addresses
     * @dev Helper for requestRebalance - iterates through known strategies
     */
    function getApprovedStrategiesArray() public view returns (address[] memory) {
        // For production: maintain a proper EnumerableSet or array
        // For demo: check known strategies
        address[] memory potentialStrategies = new address[](3);
        potentialStrategies[0] = 0xa0811A54F72Fd3e7b0F30d75227741feFE2755fB; // FTSO
        potentialStrategies[1] = 0xA88327A42267C0dE171CBECA1b016dEF2e990612; // SparkDex
        potentialStrategies[2] = 0x276BBc877C3d50e50848E7ca8c68241D959F4800; // Enosys CDP

        // Count approved strategies
        uint256 count = 0;
        for (uint256 i = 0; i < potentialStrategies.length; i++) {
            if (approvedStrategies[potentialStrategies[i]]) {
                count++;
            }
        }

        // Build approved array
        address[] memory approved = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < potentialStrategies.length; i++) {
            if (approvedStrategies[potentialStrategies[i]]) {
                approved[index++] = potentialStrategies[i];
            }
        }

        return approved;
    }

    /**
     * @notice Executes a TEE-authorized strategy migration.
     * @dev Accepts ActionResult format from TEE node: (resultData, actionId, submissionTag, status, signature)
     * @param resultData ABI-encoded RebalancePayload
     * @param actionId Instruction ID (bytes32)
     * @param submissionTag TEE submission identifier
     * @param status Result status (1 = success)
     * @param signature TEE signature over ActionResult hash (EIP-191 personal_sign)
     */
    function executeRebalance(
        bytes calldata resultData,
        bytes32 actionId,
        string calldata submissionTag,
        uint8 status,
        bytes calldata signature
    ) external override whenNotPaused nonReentrant {
        require(teeAddress != address(0), "TEE address not set");
        require(status == 1, "TEE reported failure");

        // Verify TEE signature using EIP-191 personal_sign (3-layer hash)
        
        // Layer 1: resultHash from action result components
        bytes32 resultHash = keccak256(abi.encodePacked(
            keccak256(resultData),
            actionId,
            keccak256(bytes(submissionTag)),
            status
        ));

        // Layer 2: payloadHash with domain separation
        bytes32 payloadHash = keccak256(abi.encode(
            TEE_ACTION_RESULT_PREFIX,  // Literal bytes32("TEE_ACTION_RESULT"), not hashed
            block.chainid,
            resultHash
        ));

        // Layer 3: EIP-191 personal_sign wrapper
        bytes32 ethHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            payloadHash
        ));

        address recoveredSigner = ECDSA.recover(ethHash, signature);
        require(recoveredSigner == teeAddress, "Invalid TEE signature");

        // Decode the actual payload
        RebalancePayload memory payload = abi.decode(resultData, (RebalancePayload));
        
        // Validate payload constraints
        _validateRebalancePayload(payload);

        address previousStrategy = activeStrategy;
        if (payload.newStrategy == previousStrategy) revert StrategyUnchanged();
        if (!approvedStrategies[payload.newStrategy]) revert StrategyNotApproved(payload.newStrategy);

        rebalanceNonce = payload.nonce + 1;

        uint256 assetsWithdrawn;
        if (previousStrategy != address(0)) {
            uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
            uint256 adapterReported = IStrategyAdapter(previousStrategy).withdrawAll(payload.minAmountOut);
            uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
            assetsWithdrawn = balanceAfter - balanceBefore;

            // Trust neither a strategy return value nor an ERC-20's behavior without checking the actual balance.
            if (assetsWithdrawn < payload.minAmountOut || adapterReported < payload.minAmountOut) {
                revert SlippageExceeded(payload.minAmountOut, assetsWithdrawn);
            }
            uint256 residualValue = IStrategyAdapter(previousStrategy).totalValue();
            if (residualValue != 0) revert StrategyNotFullyWithdrawn(previousStrategy, residualValue);
        }

        uint256 balanceToDeploy = IERC20(asset()).balanceOf(address(this));
        uint256 assetsToDeposit = (balanceToDeploy * (MAX_BPS - liquidityBufferBps)) / MAX_BPS;
        uint256 assetsDeposited;
        if (assetsToDeposit != 0) {
            IERC20(asset()).forceApprove(payload.newStrategy, assetsToDeposit);
            uint256 balanceBeforeDeposit = IERC20(asset()).balanceOf(address(this));
            uint256 adapterReported = IStrategyAdapter(payload.newStrategy).deposit(assetsToDeposit);
            uint256 balanceAfterDeposit = IERC20(asset()).balanceOf(address(this));
            IERC20(asset()).forceApprove(payload.newStrategy, 0);

            assetsDeposited = balanceBeforeDeposit - balanceAfterDeposit;
            if (assetsDeposited != assetsToDeposit || adapterReported != assetsToDeposit) {
                revert InvalidAdapterDeposit(assetsToDeposit, assetsDeposited);
            }
        }

        activeStrategy = payload.newStrategy;
        teeLastActive = block.timestamp;

        emit Rebalanced(previousStrategy, payload.newStrategy, assetsWithdrawn, assetsDeposited);
    }

    /**
     * @notice Pulls all capital out of the active strategy after FCC has been unavailable for seven days.
     * @dev `owner` is expected to be a DAO multi-sig. This operation does not transfer assets to the owner.
     */
    function forceWithdrawAll(uint256 minAmountOut) external onlyOwner nonReentrant returns (uint256 assetsWithdrawn) {
        uint256 availableAt = teeLastActive + TEE_TIMEOUT;
        if (block.timestamp <= availableAt) revert FallbackNotAvailable(availableAt);

        address strategy = activeStrategy;
        if (strategy == address(0)) return 0;

        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        uint256 adapterReported = IStrategyAdapter(strategy).withdrawAll(minAmountOut);
        uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
        assetsWithdrawn = balanceAfter - balanceBefore;
        if (assetsWithdrawn < minAmountOut || adapterReported < minAmountOut) {
            revert SlippageExceeded(minAmountOut, assetsWithdrawn);
        }
        uint256 residualValue = IStrategyAdapter(strategy).totalValue();
        if (residualValue != 0) revert StrategyNotFullyWithdrawn(strategy, residualValue);

        activeStrategy = address(0);
        emit EmergencyWithdrawal(strategy, assetsWithdrawn);
    }

    function setStrategyAdapter(address strategy, bool approved) external onlyOwner {
        if (strategy == address(0)) revert ZeroAddress();
        if (approved) {
            address strategyAsset = IStrategyAdapter(strategy).asset();
            if (strategyAsset != asset()) revert StrategyAssetMismatch(strategy, strategyAsset);
        } else if (strategy == activeStrategy) {
            revert StrategyUnchanged();
        }

        approvedStrategies[strategy] = approved;
        emit StrategyApprovalUpdated(strategy, approved);
    }

    function setFccSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address previousSigner = fccSigner;
        fccSigner = newSigner;
        emit FccSignerUpdated(previousSigner, newSigner);
    }

    function setFAssetAdapter(address newAdapter) external onlyOwner {
        address previousAdapter = fAssetAdapter;
        fAssetAdapter = newAdapter;
        emit FAssetAdapterUpdated(previousAdapter, newAdapter);
    }

    function setLiquidityBufferBps(uint16 newBufferBps) external onlyOwner {
        if (newBufferBps > MAX_BPS) revert InvalidLiquidityBuffer(newBufferBps);
        uint16 previousBufferBps = liquidityBufferBps;
        liquidityBufferBps = newBufferBps;
        emit LiquidityBufferUpdated(previousBufferBps, newBufferBps);
    }

    function setInstructionSender(address newSender) external onlyOwner {
        address previousSender = instructionSender;
        instructionSender = newSender;
        emit InstructionSenderUpdated(previousSender, newSender);
    }

    function setTeeAddress(address newTeeAddress) external onlyOwner {
        address previousTeeAddress = teeAddress;
        teeAddress = newTeeAddress;
        emit TeeAddressUpdated(previousTeeAddress, newTeeAddress);
    }

    function setRebalanceThreshold(uint256 newThreshold) external onlyOwner {
        rebalanceThreshold = newThreshold;
    }

    /// @notice One-time recovery: clears a corrupted activeStrategy and resets teeLastActive.
    function clearActiveStrategy() external onlyOwner {
        address corrupted = activeStrategy;
        activeStrategy = address(0);
        teeLastActive = block.timestamp;
        emit ActiveStrategyReset(corrupted);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Validates a rebalance payload (nonce, deadline, TWAP windows)
     * @dev Extracted from executeRebalance for clarity
     */
    function _validateRebalancePayload(RebalancePayload memory payload) private view {
        if (payload.nonce != rebalanceNonce) revert InvalidNonce(rebalanceNonce, payload.nonce);
        if (block.timestamp > payload.deadline) revert RebalanceExpired(payload.deadline, block.timestamp);
        if (payload.twapEnd > block.timestamp || payload.twapEnd <= payload.twapStart) {
            revert InvalidTwapWindow(payload.twapStart, payload.twapEnd);
        }
        if (payload.twapEnd - payload.twapStart < MIN_TWAP_WINDOW) {
            revert InvalidTwapWindow(payload.twapStart, payload.twapEnd);
        }
        if (block.timestamp - payload.twapEnd > MAX_TWAP_AGE) {
            revert StaleTwap(payload.twapEnd, block.timestamp);
        }
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 idleAssets = IERC20(asset()).balanceOf(address(this));
        if (idleAssets < assets) {
            address strategy = activeStrategy;
            if (strategy == address(0)) revert InsufficientLiquidity(assets, idleAssets);

            uint256 shortfall = assets - idleAssets;
            uint256 actualAmountOut = IStrategyAdapter(strategy).withdraw(shortfall, shortfall);
            uint256 newIdleAssets = IERC20(asset()).balanceOf(address(this));
            if (actualAmountOut < shortfall || newIdleAssets < assets) {
                revert InsufficientLiquidity(assets, newIdleAssets);
            }
        }

        super._withdraw(caller, receiver, owner, assets, shares);
    }

    /// @dev Rejects fee-on-transfer behavior so every share mint is backed by the advertised FAsset amount.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        super._deposit(caller, receiver, assets, shares);
        uint256 assetsReceived = IERC20(asset()).balanceOf(address(this)) - balanceBefore;
        if (assetsReceived != assets) revert UnexpectedAssetTransfer(assets, assetsReceived);

        // Automatic rebalance trigger for demo
        if (instructionSender != address(0) && rebalanceThreshold > 0) {
            uint256 currentIdle = IERC20(asset()).balanceOf(address(this));
            if (currentIdle >= rebalanceThreshold) {
                // Try to trigger rebalance, but don't revert if it fails
                try this.requestRebalance() {} catch {}
            }
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    uint256[42] private __gap;
}
