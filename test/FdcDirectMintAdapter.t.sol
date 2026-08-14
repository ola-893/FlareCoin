// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {FdcDirectMintAdapter} from "../src/adapters/FdcDirectMintAdapter.sol";
import {ParentVault} from "../src/core/ParentVault.sol";
import {IAssetManager} from "../src/interfaces/IAssetManager.sol";
import {IMintingTagManager} from "../src/interfaces/IMintingTagManager.sol";
import {IParentVault} from "../src/interfaces/IParentVault.sol";
import {IXRPPayment} from "../src/interfaces/IXRPPayment.sol";

contract FdcTestFXRP is ERC20 {
    constructor() ERC20("FDC Test FXRP", "tFXRP") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract FdcTestTagManager is IMintingTagManager {
    uint256 public override reservationFee;
    uint256 private nextTag = 1;

    mapping(uint256 => address) internal ownerOfTag;
    mapping(uint256 => address) internal recipientOfTag;
    mapping(uint256 => address) internal executorOfTag;

    constructor(uint256 fee) {
        reservationFee = fee;
    }

    function reserve() external payable returns (uint256 tag) {
        require(msg.value == reservationFee, "wrong fee");
        tag = nextTag++;
        ownerOfTag[tag] = msg.sender;
        recipientOfTag[tag] = msg.sender;
    }

    function setMintingRecipient(uint256 tag, address recipient) external {
        require(ownerOfTag[tag] == msg.sender, "not owner");
        recipientOfTag[tag] = recipient;
    }

    function setAllowedExecutor(uint256 tag, address executor) external {
        require(ownerOfTag[tag] == msg.sender, "not owner");
        executorOfTag[tag] = executor;
    }

    function mintingRecipient(uint256 tag) external view returns (address) {
        return recipientOfTag[tag];
    }

    function allowedExecutor(uint256 tag) external view returns (address) {
        return executorOfTag[tag];
    }
}

contract FdcTestAssetManager is IAssetManager {
    FdcTestFXRP internal immutable token;
    address public mintTarget;
    uint256 public mintingFeeBips;
    uint256 public minimumFee;
    uint256 public executorFee;
    bool public deferMint;

    bool public revertAlreadyConfirmed;

    constructor(FdcTestFXRP token_) {
        token = token_;
        mintingFeeBips = 100;
        minimumFee = 100;
        executorFee = 200;
    }

    function setMintTarget(address target) external {
        mintTarget = target;
    }

    function setDeferred(bool deferred_) external {
        deferMint = deferred_;
    }

    function setRevertAlreadyConfirmed(bool revert_) external {
        revertAlreadyConfirmed = revert_;
    }

    function executeDirectMinting(IXRPPayment.Proof calldata payment) external payable {
        if (revertAlreadyConfirmed) {
            revert("PaymentAlreadyConfirmed");
        }
        if (deferMint) return;
        uint256 received = uint256(payment.data.responseBody.receivedAmount);
        uint256 fee = (received * mintingFeeBips) / 10_000;
        if (fee < minimumFee) fee = minimumFee;
        if (fee > received) fee = received;
        token.mint(mintTarget, received - fee);
    }

    function executeDirectMintingWithData(IXRPPayment.Proof calldata, bytes calldata) external payable {}

    function directMintingPaymentAddress() external pure returns (string memory) {
        return "rFdcTestCoreVault";
    }

    function fAsset() external view returns (address) {
        return address(token);
    }

    function getDirectMintingFeeBIPS() external view returns (uint256) {
        return mintingFeeBips;
    }

    function getDirectMintingMinimumFeeUBA() external view returns (uint256) {
        return minimumFee;
    }

    function getDirectMintingExecutorFeeUBA() external view returns (uint256) {
        return executorFee;
    }
}

contract FdcDirectMintAdapterTest is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant RELAYER = address(0xB0B);
    uint256 internal constant RESERVATION_FEE = 1 ether;

    FdcTestFXRP internal token;
    FdcTestTagManager internal tagManager;
    FdcTestAssetManager internal assetManager;
    ParentVault internal vault;
    FdcDirectMintAdapter internal adapter;

    function setUp() public {
        token = new FdcTestFXRP();
        tagManager = new FdcTestTagManager(RESERVATION_FEE);
        assetManager = new FdcTestAssetManager(token);

        ParentVault implementation = new ParentVault();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(
                ParentVault.initialize,
                (IERC20(token), "Flux", "FLUX", address(this), address(0xFcc), address(0), uint16(1_000))
            )
        );
        vault = ParentVault(address(proxy));

        adapter = new FdcDirectMintAdapter(assetManager, tagManager, IParentVault(address(vault)), address(this));
        assetManager.setMintTarget(address(adapter));
        vault.setFAssetAdapter(address(adapter));
        vm.deal(ALICE, 2 ether);
    }

    function test_RegistersTagWithOpenExecutorAndAdapterRecipient() public {
        uint256 tag = _registerTag();

        assertEq(adapter.tagUser(tag), ALICE);
        assertEq(tagManager.mintingRecipient(tag), address(adapter));
        assertEq(tagManager.allowedExecutor(tag), address(0), "proof ownership replaces operator executor");
    }

    function test_FdcProofMintsNetAssetsAndPaysRelayerFee() public {
        uint256 tag = _registerTag();
        uint256 received = 100_000;
        // fee = max(1%, 100) = 1_000; executor fee = 200; user gets 98_800.
        IXRPPayment.Proof memory proof = _proof(keccak256("payment-1"), tag, received, address(adapter));

        vm.prank(RELAYER);
        uint256 shares = adapter.executeFdcDirectMint(proof);

        assertEq(shares, 98_800);
        assertEq(vault.balanceOf(ALICE), 98_800);
        assertEq(token.balanceOf(RELAYER), 200);
        assertEq(token.balanceOf(address(vault)), 98_800);
        assertTrue(adapter.processedPayments(keccak256("payment-1")));
    }

    function test_AllowsAnyValidProofOwner() public {
        uint256 tag = _registerTag();
        IXRPPayment.Proof memory proof = _proof(keccak256("payment-2"), tag, 100_000, ALICE);

        vm.prank(RELAYER);
        uint256 shares = adapter.executeFdcDirectMint(proof);
        assertEq(shares, 98_800);
        assertEq(vault.balanceOf(ALICE), 98_800);
    }

    function test_DelayedMintCanBeRetriedWithSameProof() public {
        uint256 tag = _registerTag();
        IXRPPayment.Proof memory proof = _proof(keccak256("payment-3"), tag, 100_000, address(adapter));
        assetManager.setDeferred(true);

        uint256 firstResult = adapter.executeFdcDirectMint(proof);
        assertEq(firstResult, 0);
        assertFalse(adapter.processedPayments(keccak256("payment-3")));

        assetManager.setDeferred(false);
        uint256 secondResult = adapter.executeFdcDirectMint(proof);
        assertEq(secondResult, 98_800);
        assertTrue(adapter.processedPayments(keccak256("payment-3")));
    }

    function test_SettlesWhenAssetManagerAlreadyConfirmedByRelayer() public {
        uint256 tag = _registerTag();
        uint256 received = 100_000;
        // fee = 1_000; executor fee = 200; net for user = 98_800.
        // A public relayer already called executeDirectMinting, so adapter already received 99_000 FXRP.
        token.mint(address(adapter), 99_000);
        assetManager.setRevertAlreadyConfirmed(true);

        IXRPPayment.Proof memory proof = _proof(keccak256("payment-relayer-1"), tag, received, address(0));

        // When user/relayer calls adapter, it should catch PaymentAlreadyConfirmed and settle user vault shares!
        vm.prank(ALICE);
        uint256 shares = adapter.executeFdcDirectMint(proof);

        assertEq(shares, 98_800);
        assertEq(vault.balanceOf(ALICE), 98_800);
        assertEq(token.balanceOf(address(vault)), 98_800);
        assertTrue(adapter.processedPayments(keccak256("payment-relayer-1")));
    }

    function test_AllowsUnrestrictedProofOwnerZero() public {
        uint256 tag = _registerTag();
        uint256 received = 100_000;
        IXRPPayment.Proof memory proof = _proof(keccak256("payment-unrestricted"), tag, received, address(0));

        vm.prank(ALICE);
        uint256 shares = adapter.executeFdcDirectMint(proof);

        assertEq(shares, 98_800);
        assertEq(vault.balanceOf(ALICE), 98_800);
    }

    function test_OwnerCanRegisterExistingTag() public {
        uint256 tag = 440;
        adapter.registerExistingTag(tag, ALICE);

        assertEq(adapter.tagUser(tag), ALICE);
        uint256[] memory tags = adapter.getTagsForUser(ALICE);
        assertEq(tags.length, 1);
        assertEq(tags[0], tag);
    }

    function _registerTag() private returns (uint256) {
        vm.prank(ALICE);
        return adapter.registerMintingTag{value: RESERVATION_FEE}();
    }

    function _proof(bytes32 transactionId, uint256 tag, uint256 received, address proofOwner)
        private
        pure
        returns (IXRPPayment.Proof memory proof)
    {
        IXRPPayment.RequestBody memory requestBody = IXRPPayment.RequestBody({
            transactionId: transactionId,
            proofOwner: proofOwner
        });
        IXRPPayment.ResponseBody memory responseBody = IXRPPayment.ResponseBody({
            blockNumber: 1,
            blockTimestamp: 1,
            sourceAddress: "rSource",
            sourceAddressHash: bytes32(0),
            receivingAddressHash: bytes32(uint256(1)),
            intendedReceivingAddressHash: bytes32(uint256(1)),
            spentAmount: int256(received),
            intendedSpentAmount: int256(received),
            receivedAmount: int256(received),
            intendedReceivedAmount: int256(received),
            hasMemoData: false,
            firstMemoData: bytes(""),
            hasDestinationTag: true,
            destinationTag: tag,
            status: 0
        });
        proof = IXRPPayment.Proof({
            merkleProof: new bytes32[](0),
            data: IXRPPayment.Response({
                attestationType: bytes32("XRPPayment"),
                sourceId: bytes32("testXRP"),
                votingRound: 1,
                lowestUsedTimestamp: 1,
                requestBody: requestBody,
                responseBody: responseBody
            })
        });
    }
}
