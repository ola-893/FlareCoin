// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXRPPayment} from "./IXRPPayment.sol";

/**
 * @title IAssetManager
 * @notice Interface for FAssets AssetManager contract
 */
interface IAssetManager {
    /// @notice Finalize a tag or memo based direct mint using an FDC XRPPayment proof.
    function executeDirectMinting(IXRPPayment.Proof calldata _payment) external payable;

    /// @notice Finalize a 0xFE smart-account mint using an FDC XRPPayment proof.
    function executeDirectMintingWithData(
        IXRPPayment.Proof calldata _payment,
        bytes calldata _data
    ) external payable;

    /**
     * @notice Get the core vault payment address for direct minting
     */
    function directMintingPaymentAddress() external view returns (string memory);

    /**
     * @notice Get the FAsset token address
     */
    function fAsset() external view returns (address);

    function getDirectMintingFeeBIPS() external view returns (uint256);
    function getDirectMintingMinimumFeeUBA() external view returns (uint256);
    function getDirectMintingExecutorFeeUBA() external view returns (uint256);
}
