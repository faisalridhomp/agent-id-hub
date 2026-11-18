// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentIDHub} from "../src/AgentIDHub.sol";
import {MockAgentID} from "./MockAgentID.sol";

/// @notice Testnet deploy: MockAgentID (no official Agent ID on BSC testnet)
///         + AgentIDHub. Seeds the deployer with a test Agent ID handle.
///         Usage:
///           forge script script/DeployTestnet.s.sol --rpc-url <testnet RPC>
///             --broadcast --private-key $KEY
///         Optional env: TEST_HANDLE (default "tester"), SEED_ADDRESSES
///         (comma-separated extra addresses to seed with handle "testerN").
contract DeployTestnet is Script {
    function run() external {
        vm.startBroadcast();
        MockAgentID mock = new MockAgentID();
        AgentIDHub hub = new AgentIDHub(address(mock));
        // Seed the deployer so the frontend works immediately.
        string memory handle = vm.envOr("TEST_HANDLE", string("tester"));
        mock.giveId(msg.sender, handle);
        vm.stopBroadcast();
        console.log("MockAgentID deployed at:", address(mock));
        console.log("AgentIDHub deployed at:", address(hub));
        console.log("StreakBadge deployed at:", address(hub.badge()));
        console.log("Deployer seeded with handle:", handle);
    }
}
