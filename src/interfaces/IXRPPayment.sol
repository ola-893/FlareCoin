// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IXRPPayment
 * @notice Flare Data Connector proof format for a native XRPL payment.
 * @dev Mirrors Flare's published IXRPPayment interface. Keep field order in
 *      sync with the FDC interface: it is part of the ABI consumed by the
 *      live FAssets AssetManager.
 */
interface IXRPPayment {
    struct Request {
        bytes32 attestationType;
        bytes32 sourceId;
        bytes32 messageIntegrityCode;
        RequestBody requestBody;
    }

    struct Response {
        bytes32 attestationType;
        bytes32 sourceId;
        uint64 votingRound;
        uint64 lowestUsedTimestamp;
        RequestBody requestBody;
        ResponseBody responseBody;
    }

    struct Proof {
        bytes32[] merkleProof;
        Response data;
    }

    struct RequestBody {
        bytes32 transactionId;
        address proofOwner;
    }

    struct ResponseBody {
        uint64 blockNumber;
        uint64 blockTimestamp;
        string sourceAddress;
        bytes32 sourceAddressHash;
        bytes32 receivingAddressHash;
        bytes32 intendedReceivingAddressHash;
        int256 spentAmount;
        int256 intendedSpentAmount;
        int256 receivedAmount;
        int256 intendedReceivedAmount;
        bool hasMemoData;
        bytes firstMemoData;
        bool hasDestinationTag;
        uint256 destinationTag;
        uint8 status;
    }
}
