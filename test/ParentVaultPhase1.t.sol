// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ParentVault} from "../src/core/ParentVault.sol";
import {IParentVault} from "../src/interfaces/IParentVault.sol";
import {IStrategyAdapter} from "../src/interfaces/IStrategyAdapter.sol";
import {MockInstructionSender} from "../src/mock/MockInstructionSender.sol";
import {RebalanceTestHelper} from "./helpers/RebalanceTestHelper.sol";

contract MockFAsset is ERC20 {
    constructor() ERC20("Mock FAsset", "MFASSET") {}
    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract MockStrategy is IStrategyAdapter {
    using SafeERC20 for IERC20;
    
    address public immutable asset;
    address public immutable vault;
    
    constructor(address _asset, address _vault) {
        asset = _asset;
        vault = _vault;
    }
    
    function deposit(uint256 amount) external returns (uint256) {
        // Actually pull tokens from vault
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        return amount;
    }
    
    function withdraw(uint256 amount, uint256) external returns (uint256) {
        // Return tokens to vault
        IERC20(asset).safeTransfer(msg.sender, amount);
        return amount;
    }
    
    function withdrawAll(uint256) external returns (uint256) {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset).safeTransfer(msg.sender, balance);
        }
        return balance;
    }
    
    function totalValue() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }
}

/**
 * @title ParentVaultPhase1Test
 * @notice Tests for Phase 1 corrections - ActionResult signature format
 */
contract ParentVaultPhase1Test is Test {
    ParentVault public vault;
    MockFAsset public fAsset;
    MockInstructionSender public instructionSender;
    MockStrategy public mockStrategy;
    
    address public owner = address(0x1);
    address public teeNode;
    uint256 public teeNodePrivateKey = 0x1234567890123456789012345678901234567890123456789012345678901234;
    address public user = address(0x3);

    function setUp() public {
        // Derive TEE address from private key
        teeNode = vm.addr(teeNodePrivateKey);
        
        vm.startPrank(owner);

        // Deploy mock FAsset
        fAsset = new MockFAsset();

        // Deploy ParentVault implementation
        ParentVault implementation = new ParentVault();

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            ParentVault.initialize.selector,
            IERC20(address(fAsset)),
            "Flux FAsset Vault",
            "fFASS",
            owner,
            owner, // fccSigner (unused now)
            address(0), // fAssetAdapter
            1000 // 10% liquidity buffer
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        vault = ParentVault(address(proxy));

        // Deploy mock instruction sender
        instructionSender = new MockInstructionSender();
        vault.setInstructionSender(address(instructionSender));
        
        // Set TEE address for signature verification
        vault.setTeeAddress(teeNode);
        
        // Deploy mock strategy
        mockStrategy = new MockStrategy(address(fAsset), address(vault));
        vault.setStrategyAdapter(address(mockStrategy), true);

        vm.stopPrank();

        // Mint tokens to user
        fAsset.mint(user, 1000 ether);
    }

    function testSetTeeAddress() public {
        vm.prank(owner);
        address newTee = address(0x999);
        vault.setTeeAddress(newTee);
        assertEq(vault.teeAddress(), newTee);
    }

    function testExecuteRebalanceWithActionResultFormat() public {
        // Setup: deposit some assets
        vm.startPrank(user);
        fAsset.approve(address(vault), 100 ether);
        vault.deposit(100 ether, user);
        vm.stopPrank();

        // Warp time to ensure TWAP windows are valid
        vm.warp(block.timestamp + 27 hours);

        // Create a rebalance payload (using mockStrategy which is approved)
        IParentVault.RebalancePayload memory payload = IParentVault.RebalancePayload({
            newStrategy: address(mockStrategy),
            minAmountOut: 0,
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            twapStart: block.timestamp - 26 hours,
            twapEnd: block.timestamp - 1 hours,
            strategyDataHash: bytes32(0)
            // NO signature field - it's passed separately
        });

        // Note: mockStrategy already approved in setUp
        // activeStrategy should be address(0) initially, so no conflict

        // Encode as resultData (ActionResult format)
        bytes memory resultData = RebalanceTestHelper.encodeRebalancePayload(payload);
        
        // Create action result metadata
        bytes32 actionId = keccak256(abi.encode("test-action", block.timestamp));
        string memory submissionTag = "test-submission-001";
        uint8 status = 1; // Success

        // Compute signature hash (3-layer EIP-191)
        bytes32 ethHash = RebalanceTestHelper.computeActionResultHash(
            resultData,
            actionId,
            submissionTag,
            status
        );

        // Sign with TEE private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teeNodePrivateKey, ethHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        // FCC action-result signatures encode recovery ID as 0/1 rather than 27/28.
        signature[64] = bytes1(uint8(signature[64]) - 27);

        // Execute rebalance with ActionResult format
        vault.executeRebalance(
            resultData,
            actionId,
            submissionTag,
            status,
            signature
        );

        // Verify strategy was changed
        assertEq(vault.activeStrategy(), payload.newStrategy);
        assertEq(vault.rebalanceNonce(), 1);
    }

    function testExecuteRebalanceSameStrategyTopUp() public {
        // Setup: deposit some assets
        vm.startPrank(user);
        fAsset.approve(address(vault), 100 ether);
        vault.deposit(100 ether, user);
        vm.stopPrank();

        // Warp time to ensure TWAP windows are valid
        vm.warp(block.timestamp + 27 hours);

        // First rebalance: deploy into mockStrategy
        IParentVault.RebalancePayload memory payload = IParentVault.RebalancePayload({
            newStrategy: address(mockStrategy),
            minAmountOut: 0,
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            twapStart: block.timestamp - 26 hours,
            twapEnd: block.timestamp - 1 hours,
            strategyDataHash: bytes32(0)
        });

        bytes memory resultData = RebalanceTestHelper.encodeRebalancePayload(payload);
        bytes32 actionId = keccak256(abi.encode("test-action", block.timestamp));
        string memory submissionTag = "test-submission-001";
        uint8 status = 1;

        bytes32 ethHash = RebalanceTestHelper.computeActionResultHash(
            resultData, actionId, submissionTag, status
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teeNodePrivateKey, ethHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vault.executeRebalance(resultData, actionId, submissionTag, status, signature);
        assertEq(vault.activeStrategy(), address(mockStrategy));
        assertEq(vault.rebalanceNonce(), 1);

        uint256 strategyBalanceAfterFirst = fAsset.balanceOf(address(mockStrategy));
        assertGt(strategyBalanceAfterFirst, 0, "strategy should hold assets after first rebalance");

        // User deposits MORE assets while the same strategy is still active
        vm.startPrank(user);
        fAsset.approve(address(vault), 50 ether);
        vault.deposit(50 ether, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 27 hours);

        // Second rebalance: SAME strategy selected by TEE -> must TOP-UP, not revert
        IParentVault.RebalancePayload memory topUpPayload = IParentVault.RebalancePayload({
            newStrategy: address(mockStrategy),
            minAmountOut: 0,
            nonce: 1,
            deadline: block.timestamp + 1 hours,
            twapStart: block.timestamp - 26 hours,
            twapEnd: block.timestamp - 1 hours,
            strategyDataHash: bytes32(0)
        });

        bytes memory topUpData = RebalanceTestHelper.encodeRebalancePayload(topUpPayload);
        bytes32 topUpActionId = keccak256(abi.encode("test-action-2", block.timestamp));
        string memory topUpTag = "test-submission-002";

        bytes32 topUpHash = RebalanceTestHelper.computeActionResultHash(
            topUpData, topUpActionId, topUpTag, status
        );
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(teeNodePrivateKey, topUpHash);
        bytes memory topUpSignature = abi.encodePacked(r2, s2, v2);

        vault.executeRebalance(topUpData, topUpActionId, topUpTag, status, topUpSignature);

        // Strategy unchanged but its balance grew (top-up deployed idle assets)
        assertEq(vault.activeStrategy(), address(mockStrategy));
        assertEq(vault.rebalanceNonce(), 2);
        uint256 strategyBalanceAfterTopUp = fAsset.balanceOf(address(mockStrategy));
        assertGt(strategyBalanceAfterTopUp, strategyBalanceAfterFirst, "top-up should deploy more assets");
    }

    function testExecuteRebalanceRevertsWithWrongSigner() public {
        // Setup: deposit some assets
        vm.startPrank(user);
        fAsset.approve(address(vault), 100 ether);
        vault.deposit(100 ether, user);
        vm.stopPrank();

        // Warp time to ensure TWAP windows are valid
        vm.warp(block.timestamp + 27 hours);

        // Create payload
        IParentVault.RebalancePayload memory payload = IParentVault.RebalancePayload({
            newStrategy: address(mockStrategy),
            minAmountOut: 0,
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            twapStart: block.timestamp - 26 hours,
            twapEnd: block.timestamp - 1 hours,
            strategyDataHash: bytes32(0)
        });

        bytes memory resultData = RebalanceTestHelper.encodeRebalancePayload(payload);
        bytes32 actionId = keccak256(abi.encode("test", block.timestamp));
        string memory submissionTag = "test";
        uint8 status = 1;

        bytes32 ethHash = RebalanceTestHelper.computeActionResultHash(
            resultData, actionId, submissionTag, status
        );

        // Sign with WRONG private key
        uint256 wrongPrivateKey = 0x9999;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPrivateKey, ethHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Should revert with "Invalid TEE signature"
        vm.expectRevert("Invalid TEE signature");
        vault.executeRebalance(resultData, actionId, submissionTag, status, signature);
    }

    function testExecuteRebalanceRevertsWithoutTeeAddress() public {
        // Deploy fresh vault without TEE address set
        vm.startPrank(owner);
        ParentVault implementation = new ParentVault();
        bytes memory initData = abi.encodeWithSelector(
            ParentVault.initialize.selector,
            IERC20(address(fAsset)),
            "Flux FAsset Vault 2",
            "fFASS2",
            owner,
            owner,
            address(0),
            1000
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        ParentVault freshVault = ParentVault(address(proxy));
        vm.stopPrank();

        // Try to execute rebalance without setting TEE address
        bytes memory resultData = hex"1234";
        bytes32 actionId = bytes32(uint256(1));
        string memory submissionTag = "test";
        uint8 status = 1;
        bytes memory signature = hex"00";

        vm.expectRevert("TEE address not set");
        freshVault.executeRebalance(resultData, actionId, submissionTag, status, signature);
    }

    function testRequestRebalanceEmitsCorrectInstructionId() public {
        // Setup: deposit enough to trigger rebalance
        vm.startPrank(owner);
        vault.setRebalanceThreshold(50 ether);
        vm.stopPrank();

        vm.startPrank(user);
        fAsset.approve(address(vault), 100 ether);
        vault.deposit(100 ether, user);
        vm.stopPrank();

        // Request rebalance manually and ensure the FCC fee is forwarded.
        uint256 instructionFee = 1_000_000;
        vm.deal(address(this), instructionFee);
        vault.requestRebalance{value: instructionFee}();

        // Verify lastInstructionId is bytes32 (not uint256)
        bytes32 lastId = vault.lastInstructionId();
        assertTrue(lastId != bytes32(0), "Instruction ID should be non-zero");
        assertEq(instructionSender.lastValue(), instructionFee, "FCC fee should be forwarded to InstructionSender");
    }
}
