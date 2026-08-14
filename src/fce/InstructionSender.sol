// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IInstructionSender} from "../interfaces/IInstructionSender.sol";
import {ITeeExtensionRegistry} from "../interfaces/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "../interfaces/ITeeMachineRegistry.sol";

/**
 * @title InstructionSender
 * @notice Production InstructionSender that calls real TeeExtensionRegistry
 * @dev Pattern verified against fce-extension-scaffold InstructionSender.sol
 */
contract InstructionSender is IInstructionSender {
    error ExtensionIdNotSet();
    error ExtensionIdAlreadySet();
    error ExtensionIdNotFound();
    error NoTeesAvailable();

    /// @notice The TeeExtensionRegistry contract (both registry interfaces use same address)
    ITeeExtensionRegistry public immutable registry;
    
    /// @notice The TeeMachineRegistry contract (diamond proxy, same address as registry)
    ITeeMachineRegistry public immutable machineRegistry;

    /// @notice Extension ID assigned by registry after registration
    uint256 public override extensionId;

    /// @notice First public extension ID (per scaffold constants)
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;

    /// @notice Number of TEEs to request for each instruction
    uint256 private constant TEE_COUNT = 3;

    /**
     * @notice Initialize with registry addresses
     * @param _registry Address of FlareTeeManager (ITeeExtensionRegistry)
     * @param _machineRegistry Address of FlareTeeManager (ITeeMachineRegistry)
     * @dev Both addresses are the same diamond proxy on Coston2
     */
    constructor(address _registry, address _machineRegistry) {
        registry = ITeeExtensionRegistry(_registry);
        machineRegistry = ITeeMachineRegistry(_machineRegistry);
    }

    /**
     * @notice Self-discover extension ID after registration
     * @dev Call this after extension is registered via pre-build.sh
     *      Pattern copied exactly from scaffold InstructionSender.sol
     */
    function setExtensionId() external override {
        if (extensionId != 0) revert ExtensionIdAlreadySet();

        uint256 nextId = registry.nextPublicExtensionId();
        
        // Scan from FIRST_PUBLIC_EXTENSION_ID to nextId to find our extension
        for (uint256 id = FIRST_PUBLIC_EXTENSION_ID; id < nextId; id++) {
            if (registry.getTeeExtensionInstructionsSender(id) == address(this)) {
                extensionId = id;
                return;
            }
        }
        
        revert ExtensionIdNotFound();
    }

    /**
     * @notice Send instructions to TEE extension via registry
     * @param params Instruction parameters (opType, opCommand, message, etc.)
     * @return instructionId Generated instruction ID (bytes32)
     */
    function sendInstructions(
        ITeeExtensionRegistry.TeeInstructionParams calldata params
    ) external payable override returns (bytes32 instructionId) {
        if (extensionId == 0) revert ExtensionIdNotSet();

        // Dynamically request up to TEE_COUNT (or max active TEEs) to prevent TooMany() revert
        address[] memory activeTees = machineRegistry.getActiveTeeMachines(extensionId);
        uint256 count = activeTees.length < TEE_COUNT ? activeTees.length : TEE_COUNT;
        if (count == 0) revert NoTeesAvailable();

        // Get random TEE machines for this extension
        address[] memory teeIds = machineRegistry.getRandomTeeIds(extensionId, count);

        // Send to registry (forwards msg.value for TEE fees)
        instructionId = registry.sendInstructions{value: msg.value}(teeIds, params);

        emit InstructionSent(instructionId, params);
        
        return instructionId;
    }
}
