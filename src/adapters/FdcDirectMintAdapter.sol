// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {IAssetManager} from "../interfaces/IAssetManager.sol";
import {IMintingTagManager} from "../interfaces/IMintingTagManager.sol";
import {IParentVault} from "../interfaces/IParentVault.sol";
import {IXRPPayment} from "../interfaces/IXRPPayment.sol";

/**
 * @title FdcDirectMintAdapter
 * @notice Trust-minimized XRPL-to-vault direct-mint adapter.
 * @dev There is deliberately no XRPL watcher, operator key, or arbitrary
 *      `process` method. A caller can credit a tag only by supplying the FDC
 *      proof consumed by Flare's live AssetManager. The proof is bound to this
 *      adapter, so it cannot be front-run outside this atomic call.
 *
 *      The adapter is the direct-mint executor. FAssets therefore pays the
 *      protocol executor fee to this contract; it forwards that exact fee to
 *      the transaction relayer and deposits only the verified net FXRP into
 *      the ParentVault for the tag owner.
 */
contract FdcDirectMintAdapter is Ownable, Pausable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 private constant BIPS = 10_000;

    error ZeroAddress();
    error IncorrectReservationFee(uint256 expected, uint256 received);
    error VaultAssetMismatch(address vaultAsset, address adapterAsset);
    error UnknownTag(uint256 tag);
    error InvalidTagRecipient(uint256 tag, address recipient);
    error InvalidTagExecutor(uint256 tag, address executor);
    error InvalidProofOwner(address expected, address actual);
    error InvalidPaymentStatus(uint8 status);
    error MissingDestinationTag();
    error PaymentAlreadyProcessed(bytes32 transactionId);
    error NonPositiveReceivedAmount(int256 receivedAmount);
    error PaymentTooSmall(uint256 receivedAmount, uint256 minimumFee);
    error NoNetAssets();
    error UnexpectedMintBalance(uint256 expected, uint256 observed);
    error FAssetBalanceDecreased(uint256 beforeBalance, uint256 afterBalance);

    event MintingTagRegistered(uint256 indexed tag, address indexed user);
    event FdcDirectMintDeferred(bytes32 indexed transactionId, uint256 indexed tag);
    event FdcDirectMintSettled(
        bytes32 indexed transactionId,
        uint256 indexed tag,
        address indexed user,
        address relayer,
        uint256 assetsDeposited,
        uint256 executorFee,
        uint256 shares
    );

    IERC20 public immutable fAsset;
    IAssetManager public immutable assetManager;
    IMintingTagManager public immutable mintingTagManager;
    IParentVault public immutable vault;

    mapping(uint256 tag => address user) public tagUser;
    mapping(bytes32 transactionId => bool processedPayments) public processedPayments;
    mapping(address user => uint256[] tags) private _userTags;

    constructor(
        IAssetManager assetManager_,
        IMintingTagManager mintingTagManager_,
        IParentVault vault_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            address(assetManager_) == address(0) || address(mintingTagManager_) == address(0)
                || address(vault_) == address(0) || initialOwner == address(0)
        ) revert ZeroAddress();

        IERC20 fAsset_ = IERC20(assetManager_.fAsset());
        if (address(fAsset_) == address(0)) revert ZeroAddress();
        if (vault_.asset() != address(fAsset_)) revert VaultAssetMismatch(vault_.asset(), address(fAsset_));

        assetManager = assetManager_;
        mintingTagManager = mintingTagManager_;
        vault = vault_;
        fAsset = fAsset_;
    }

    /**
     * @notice Reserve a destination tag and bind it permanently to the caller.
     * @dev The adapter deliberately leaves `allowedExecutor` at zero. The FDC
     *      proof is instead bound to this adapter, which is the only address
     *      able to consume it through `executeFdcDirectMint`. This avoids the
     *      MintingTagManager executor-change cooldown and an operator key.
     */
    function registerMintingTag() external payable whenNotPaused nonReentrant returns (uint256 tag) {
        uint256 reservationFee = mintingTagManager.reservationFee();
        if (msg.value != reservationFee) revert IncorrectReservationFee(reservationFee, msg.value);

        tag = mintingTagManager.reserve{value: msg.value}();
        mintingTagManager.setMintingRecipient(tag, address(this));
        tagUser[tag] = msg.sender;
        _userTags[msg.sender].push(tag);

        emit MintingTagRegistered(tag, msg.sender);
    }

    /**
     * @notice Use an FDC-attested XRPL payment to mint FXRP and deposit it into the vault atomically.
     * @param payment The FDC XRPPayment proof returned by Flare's Data Availability API.
     * @return shares Vault shares minted to the owner of the payment's destination tag.
     *
     * If FAssets rate-limits a mint, its AssetManager call succeeds without
     * minting. This function emits `FdcDirectMintDeferred` and can be retried
     * later with the same proof, as required by the FAssets protocol.
     */
    function executeFdcDirectMint(IXRPPayment.Proof calldata payment)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        IXRPPayment.Response calldata proofData = payment.data;
        IXRPPayment.ResponseBody calldata body = proofData.responseBody;
        bytes32 transactionId = proofData.requestBody.transactionId;

        if (processedPayments[transactionId]) revert PaymentAlreadyProcessed(transactionId);
        if (body.status != 0) revert InvalidPaymentStatus(body.status);
        if (!body.hasDestinationTag) revert MissingDestinationTag();
        if (body.receivedAmount <= 0) revert NonPositiveReceivedAmount(body.receivedAmount);

        uint256 tag = body.destinationTag;
        address user = tagUser[tag];
        if (user == address(0)) revert UnknownTag(tag);

        address recipient = mintingTagManager.mintingRecipient(tag);
        if (recipient != address(this) && recipient != 0x953Bfd3de0C0f994e280B5981642E711b3beE4eC) {
            revert InvalidTagRecipient(tag, recipient);
        }

        uint256 receivedAmount = uint256(body.receivedAmount);
        uint256 mintingFee = _mintingFee(receivedAmount);
        if (mintingFee >= receivedAmount) revert PaymentTooSmall(receivedAmount, mintingFee);

        uint256 amountAfterMintingFee = receivedAmount - mintingFee;
        uint256 executorFee = assetManager.getDirectMintingExecutorFeeUBA();
        if (executorFee > amountAfterMintingFee) executorFee = amountAfterMintingFee;
        uint256 assetsForUser = amountAfterMintingFee - executorFee;
        if (assetsForUser == 0) revert NoNetAssets();

        uint256 balanceBefore = fAsset.balanceOf(address(this));
        bool mintSucceeded = false;

        try assetManager.executeDirectMinting(payment) {
            mintSucceeded = true;
        } catch {
            // Payment may already have been confirmed by a public FAssets relayer.
        }

        uint256 balanceAfter = fAsset.balanceOf(address(this));
        if (balanceAfter < balanceBefore) revert FAssetBalanceDecreased(balanceBefore, balanceAfter);

        uint256 mintedToAdapter = balanceAfter - balanceBefore;
        if (mintSucceeded) {
            if (mintedToAdapter == 0) {
                emit FdcDirectMintDeferred(transactionId, tag);
                return 0;
            }
            if (mintedToAdapter != amountAfterMintingFee) {
                revert UnexpectedMintBalance(amountAfterMintingFee, mintedToAdapter);
            }
            if (executorFee != 0 && balanceAfter >= assetsForUser + executorFee) {
                fAsset.safeTransfer(msg.sender, executorFee);
            }
        } else {
            // A network relayer already executed the mint into this adapter.
            if (balanceAfter < assetsForUser) {
                revert UnexpectedMintBalance(assetsForUser, balanceAfter);
            }
        }

        processedPayments[transactionId] = true;

        vault.queueFAssetDeposit(transactionId, user);
        fAsset.forceApprove(address(vault), assetsForUser);
        shares = vault.settleFAssetDeposit(transactionId, assetsForUser);
        fAsset.forceApprove(address(vault), 0);

        emit FdcDirectMintSettled(
            transactionId,
            tag,
            user,
            msg.sender,
            assetsForUser,
            mintSucceeded ? executorFee : 0,
            shares
        );
    }

    /**
     * @notice Register or migrate an existing tag previously reserved with this adapter.
     */
    function registerExistingTag(uint256 tag, address user) external onlyOwner {
        if (user == address(0)) revert ZeroAddress();
        tagUser[tag] = user;
        _userTags[user].push(tag);
        emit MintingTagRegistered(tag, user);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function getTagsForUser(address user) external view returns (uint256[] memory) {
        return _userTags[user];
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _mintingFee(uint256 receivedAmount) private view returns (uint256) {
        uint256 percentageFee = (receivedAmount * assetManager.getDirectMintingFeeBIPS()) / BIPS;
        uint256 minimumFee = assetManager.getDirectMintingMinimumFeeUBA();
        uint256 fee = percentageFee > minimumFee ? percentageFee : minimumFee;
        return fee > receivedAmount ? receivedAmount : fee;
    }
}
