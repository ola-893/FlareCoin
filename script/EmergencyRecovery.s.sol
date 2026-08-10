// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ParentVaultRecovery} from "../src/core/ParentVaultRecovery.sol";
import {ParentVault} from "../src/core/ParentVault.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title EmergencyRecovery
 * @notice Script to recover from corrupted activeStrategy state
 * 
 * Steps:
 * 1. Deploy ParentVaultRecovery implementation
 * 2. Upgrade proxy to ParentVaultRecovery
 * 3. Call resetActiveStrategy()
 * 4. Optionally: Upgrade back to original ParentVault
 */
contract EmergencyRecovery is Script {
    address constant PARENT_VAULT_PROXY = 0x01f64160E4928Eba5607aE294F9B66090Dc323B3;
    address constant FTSO_V2_STRATEGY = 0xc529Eb4a03EC14E58598D03058DBb43B75059851; // live FTSO v2 adapter

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy recovery implementation
        console.log("\n=== Step 1: Deploying ParentVaultRecovery ===");
        ParentVaultRecovery recoveryImpl = new ParentVaultRecovery();
        console.log("Recovery Implementation:", address(recoveryImpl));

        // Step 2: Upgrade to recovery implementation
        console.log("\n=== Step 2: Upgrading to Recovery Implementation ===");
        ParentVaultRecovery proxy = ParentVaultRecovery(payable(PARENT_VAULT_PROXY));
        proxy.upgradeToAndCall(address(recoveryImpl), "");
        console.log("Upgraded to recovery implementation");

        // Step 3: Check current corrupted state
        console.log("\n=== Step 3: Current Corrupted State ===");
        address corruptedStrategy = proxy.activeStrategy();
        console.log("Corrupted activeStrategy:", corruptedStrategy);
        console.log("Expected corrupted value: 0x00000000000000000000000000000000000003e8");

        // Step 4: Reset activeStrategy
        console.log("\n=== Step 4: Resetting Active Strategy ===");
        proxy.resetActiveStrategy();
        
        address afterReset = proxy.activeStrategy();
        console.log("Active strategy after reset:", afterReset);
        require(afterReset == address(0), "Reset failed");
        console.log("SUCCESS: Active strategy reset to zero address");

        // Step 5: Deploy original ParentVault implementation
        console.log("\n=== Step 5: Deploying Original ParentVault ===");
        ParentVault originalImpl = new ParentVault();
        console.log("Original Implementation:", address(originalImpl));

        // Step 6: Upgrade back to original implementation
        console.log("\n=== Step 6: Upgrading Back to Original ===");
        proxy.upgradeToAndCall(address(originalImpl), "");
        console.log("Upgraded back to original ParentVault");

        // Step 7: Verify totalAssets() works
        console.log("\n=== Step 7: Verifying Functionality ===");
        ParentVault vaultProxy = ParentVault(payable(PARENT_VAULT_PROXY));
        uint256 totalAssets = vaultProxy.totalAssets();
        console.log("Total assets:", totalAssets);
        console.log("SUCCESS: Vault is now functional!");

        vm.stopBroadcast();

        console.log("\n=== Recovery Complete ===");
        console.log("The vault can now accept settlements.");
        console.log("Next step: Run your settlement transaction again.");
    }
}
