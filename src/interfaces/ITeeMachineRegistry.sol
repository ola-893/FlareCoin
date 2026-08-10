// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITeeMachineRegistry
 * @notice Interface for Flare's TEE Machine Registry
 * @dev Verified against fce-extension-scaffold contracts/interfaces/ITeeMachineRegistry.sol
 */
interface ITeeMachineRegistry {
    /**
     * @notice Get random TEE machine addresses for an extension
     * @param extensionId Extension ID
     * @param count Number of TEEs to return
     * @return Array of TEE machine addresses
     */
    function getRandomTeeIds(uint256 extensionId, uint256 count) external view returns (address[] memory);

    /**
     * @notice Get all active TEE machine addresses for an extension
     * @param extensionId Extension ID
     * @return Array of active TEE machine addresses
     */
    function getActiveTeeMachines(uint256 extensionId) external view returns (address[] memory);
}
