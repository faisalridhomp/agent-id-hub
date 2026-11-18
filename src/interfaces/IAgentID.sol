// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAgentID — minimal interface of the Binance / SPACE ID Agent ID contract
/// @notice Verified on BNB Chain mainnet at 0x60b9262456de011f7d15a54cdd8c48baaa8b022f.
///         Source verified on BscScan; ABI pulled via Etherscan V2 API (chainid 56).
///         Behaviour verified live via NodeReal RPC 2026-11-18:
///         - balanceOf(0x3Bc9...) == 1 (jackdefi.ai holder)
///         - ownerOfHandle("jackdefi") == 0x3Bc96b2528f686F27b04897bD819bC10D8981B1b
///         - handleOf(0x3Bc9...) == "jackdefi"
///         - ownerOfHandle("zzzznotreal12345") == address(0) (does NOT revert)
///         - minLen 3, maxLen 20.
interface IAgentID {
    function balanceOf(address account) external view returns (uint256);
    function ownerOfHandle(string calldata handle) external view returns (address);
    function handleOf(address account) external view returns (string memory);
    function isValidHandle(string calldata handle) external view returns (bool);
}
