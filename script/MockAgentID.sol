// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAgentID} from "../src/interfaces/IAgentID.sol";

/// @notice Testnet-only stand-in for the official Agent ID contract
///         (no official Agent ID exists on BSC testnet). Mirrors the verified
///         mainnet behaviour: ownerOfHandle returns address(0), no revert,
///         for unknown handles.
contract MockAgentID is IAgentID {
    mapping(address => uint256) public balances;
    mapping(string => address) public handleOwner;
    mapping(address => string) public handleOfAddr;

    function giveId(address who, string calldata handle) external {
        balances[who] = 1;
        handleOwner[handle] = who;
        handleOfAddr[who] = handle;
    }

    function balanceOf(address a) external view returns (uint256) {
        return balances[a];
    }

    function ownerOfHandle(string calldata h) external view returns (address) {
        return handleOwner[h];
    }

    function handleOf(address a) external view returns (string memory) {
        return handleOfAddr[a];
    }

    function isValidHandle(string calldata h) external pure returns (bool) {
        bytes memory b = bytes(h);
        return b.length >= 3 && b.length <= 20;
    }
}
