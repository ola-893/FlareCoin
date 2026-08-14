// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IInstructionSender} from "../interfaces/IInstructionSender.sol";
import {ITeeExtensionRegistry} from "../interfaces/ITeeExtensionRegistry.sol";

/**
 * @title MockInstructionSender
 * @notice Mock implementation of InstructionSender for testing
 * @dev This is a stub - does not call real registry. Use real InstructionSender for production.
 */
contract MockInstructionSender is IInstructionSender {
    uint256 public override extensionId;
    uint256 public lastValue;
    uint256 private _instructionCounter;

    function sendInstructions(
        ITeeExtensionRegistry.TeeInstructionParams calldata params
    ) external payable override returns (bytes32 instructionId) {
        lastValue = msg.value;
        // Generate a mock instruction ID
        instructionId = keccak256(abi.encode(_instructionCounter++, block.timestamp, msg.sender));
        
        emit InstructionSent(instructionId, params);
        return instructionId;
    }

    function setExtensionId() external override {
        // Mock: just set a dummy ID
        extensionId = 0x10000;
    }
}
