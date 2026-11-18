// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentIDHub} from "../src/AgentIDHub.sol";

/// @notice Deploy AgentIDHub (which deploys its own StreakBadge).
///         Usage:
///           BSC testnet:  forge script script/Deploy.s.sol --rpc-url <testnet>
///                         --broadcast --private-key $KEY
///           BSC mainnet:  forge script script/Deploy.s.sol --rpc-url <mainnet>
///                         --broadcast --private-key $KEY
///         The Agent ID address differs per network:
///           mainnet (56): 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///           testnet (97): no official Agent ID — deploy MockAgentID first
///                         (script/MockDeploy.s.sol) and pass its address.
contract Deploy is Script {
    function run() external {
        address agentId = vm.envAddress("AGENT_ID");
        vm.startBroadcast();
        AgentIDHub hub = new AgentIDHub(agentId);
        vm.stopBroadcast();
        console.log("AgentIDHub deployed at:", address(hub));
        console.log("StreakBadge deployed at:", address(hub.badge()));
        console.log("Agent ID used:", agentId);
        console.log("Owner (pause/unpause only):", hub.owner());
    }
}
