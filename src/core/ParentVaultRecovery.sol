// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ParentVault} from "./ParentVault.sol";

/**
 * @title ParentVaultRecovery
 * @notice Emergency recovery implementation to fix corrupted activeStrategy
 * @dev Deploy this as a temporary upgrade, call resetActiveStrategy(), then upgrade back
 */
contract ParentVaultRecovery is ParentVault {

    /**
     * @notice Emergency function to reset corrupted activeStrategy to address(0)
     * @dev Can only be called by owner. Does NOT attempt to call the corrupted strategy.
     */
    function resetActiveStrategy() external onlyOwner {
        address corrupted = activeStrategy;
        activeStrategy = address(0);
        emit ActiveStrategyReset(corrupted);
    }

    /**
     * @notice Emergency function to manually set activeStrategy
     * @dev Use with extreme caution. Strategy must be approved first.
     */
    function setActiveStrategyDirect(address newStrategy) external onlyOwner {
        require(approvedStrategies[newStrategy] || newStrategy == address(0), "Strategy not approved");
        address previous = activeStrategy;
        activeStrategy = newStrategy;
        emit Rebalanced(previous, newStrategy, 0, 0);
    }
}
