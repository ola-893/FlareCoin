// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {FdcDirectMintAdapter} from "../src/adapters/FdcDirectMintAdapter.sol";
import {ParentVault} from "../src/core/ParentVault.sol";
import {IAssetManager} from "../src/interfaces/IAssetManager.sol";
import {IMintingTagManager} from "../src/interfaces/IMintingTagManager.sol";
import {IParentVault} from "../src/interfaces/IParentVault.sol";

/**
 * @notice Deploys the FDC-verified direct mint adapter and atomically makes it
 *         the only adapter permitted to settle FXRP deposits in ParentVault.
 *
 * Required environment variables:
 * - PARENT_VAULT_PROXY
 * - ASSET_MANAGER_FXRP
 * - MINTING_TAG_MANAGER
 * - DAO_MULTISIG (adapter owner)
 */
contract DeployFdcDirectMintAdapter is Script {
    function run() external returns (address adapterAddress) {
        address vaultAddress = vm.envAddress("PARENT_VAULT_PROXY");
        address assetManagerAddress = vm.envAddress("ASSET_MANAGER_FXRP");
        address tagManagerAddress = vm.envAddress("MINTING_TAG_MANAGER");
        address adapterOwner = vm.envAddress("DAO_MULTISIG");

        console2.log("Deploying FDC Direct Mint Adapter");
        console2.log("  ParentVault:", vaultAddress);
        console2.log("  AssetManager:", assetManagerAddress);
        console2.log("  MintingTagManager:", tagManagerAddress);
        console2.log("  Adapter owner:", adapterOwner);

        vm.startBroadcast();
        FdcDirectMintAdapter adapter = new FdcDirectMintAdapter(
            IAssetManager(assetManagerAddress),
            IMintingTagManager(tagManagerAddress),
            IParentVault(vaultAddress),
            adapterOwner
        );
        ParentVault(vaultAddress).setFAssetAdapter(address(adapter));
        vm.stopBroadcast();

        adapterAddress = address(adapter);
        console2.log("  FdcDirectMintAdapter:", adapterAddress);
        console2.log("  ParentVault migration: complete");

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeString(json, "network", "Coston2");
        vm.serializeAddress(json, "parentVault", vaultAddress);
        vm.serializeAddress(json, "assetManagerFXRP", assetManagerAddress);
        vm.serializeAddress(json, "mintingTagManager", tagManagerAddress);
        vm.serializeAddress(json, "fdcDirectMintAdapter", adapterAddress);
        string memory output = vm.serializeAddress(json, "owner", adapterOwner);
        vm.writeJson(output, "./deployments/coston2-fdc-direct-mint-latest.json");
    }
}
