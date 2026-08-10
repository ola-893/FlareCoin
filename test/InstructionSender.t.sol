// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InstructionSender} from "../src/fce/InstructionSender.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "../src/interfaces/ITeeMachineRegistry.sol";

/**
 * @title InstructionSenderTest
 * @notice Tests for production InstructionSender contract
 */
contract InstructionSenderTest is Test {
    InstructionSender public instructionSender;
    MockRegistry public mockRegistry;
    
    address public owner = address(0x1);

    function setUp() public {
        mockRegistry = new MockRegistry();
        
        instructionSender = new InstructionSender(
            address(mockRegistry),  // registry
            address(mockRegistry)   // machineRegistry (same in production)
        );
    }

    function testConstructor() public {
        assertEq(address(instructionSender.registry()), address(mockRegistry));
        assertEq(address(instructionSender.machineRegistry()), address(mockRegistry));
        assertEq(instructionSender.extensionId(), 0); // Not set yet
    }

    function testSetExtensionId() public {
        // Setup: Register this instruction sender in mock registry
        mockRegistry.registerInstructionSender(address(instructionSender), 0x10001);
        
        // Set extension ID (should self-discover)
        instructionSender.setExtensionId();
        
        assertEq(instructionSender.extensionId(), 0x10001);
    }

    function testSetExtensionIdRevertsIfAlreadySet() public {
        mockRegistry.registerInstructionSender(address(instructionSender), 0x10001);
        instructionSender.setExtensionId();
        
        vm.expectRevert(InstructionSender.ExtensionIdAlreadySet.selector);
        instructionSender.setExtensionId();
    }

    function testSetExtensionIdRevertsIfNotFound() public {
        // Don't register, so it won't be found
        vm.expectRevert(InstructionSender.ExtensionIdNotFound.selector);
        instructionSender.setExtensionId();
    }

    function testSendInstructionsRevertsIfExtensionIdNotSet() public {
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: bytes32("TEST"),
            opCommand: bytes32("TEST_CMD"),
            message: hex"1234",
            cosigners: new address[](0),
            cosignersThreshold: 0,
            claimBackAddress: address(this)
        });

        vm.expectRevert(InstructionSender.ExtensionIdNotSet.selector);
        instructionSender.sendInstructions(params);
    }

    function testSendInstructions() public {
        // Setup
        mockRegistry.registerInstructionSender(address(instructionSender), 0x10001);
        instructionSender.setExtensionId();

        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: bytes32("VAULT_REBALANCE"),
            opCommand: bytes32("CALCULATE_OPTIMAL"),
            message: abi.encode(address(this), 100 ether),
            cosigners: new address[](0),
            cosignersThreshold: 0,
            claimBackAddress: address(this)
        });

        // Send instruction
        bytes32 instructionId = instructionSender.sendInstructions(params);
        
        // Verify instruction ID was returned
        assertTrue(instructionId != bytes32(0));
    }
}

/**
 * @title MockRegistry
 * @notice Mock registry for testing InstructionSender
 */
contract MockRegistry is ITeeExtensionRegistry, ITeeMachineRegistry {
    mapping(uint256 => address) public extensionSenders;
    uint256 public nextId = 0x10001;
    
    function registerInstructionSender(address sender, uint256 id) external {
        extensionSenders[id] = sender;
        if (id >= nextId) nextId = id + 1;
    }

    function sendInstructions(
        address[] memory, /*teeIds*/
        TeeInstructionParams calldata /*params*/
    ) external payable override returns (bytes32) {
        // Return mock instruction ID
        return keccak256(abi.encode(block.timestamp, msg.sender));
    }

    function getTeeExtensionInstructionsSender(uint256 id) external view override returns (address) {
        return extensionSenders[id];
    }

    function nextPublicExtensionId() external view override returns (uint256) {
        return nextId;
    }

    function getRandomTeeIds(uint256, uint256 count) external view override returns (address[] memory) {
        address[] memory tees = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            tees[i] = address(uint160(i + 1));
        }
        return tees;
    }

    function getActiveTeeMachines(uint256) external pure override returns (address[] memory) {
        address[] memory tees = new address[](3);
        tees[0] = address(1);
        tees[1] = address(2);
        tees[2] = address(3);
        return tees;
    }
}
