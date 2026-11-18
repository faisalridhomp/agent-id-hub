// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {HubPass} from "../src/HubPass.sol";

/// @notice Deploy HubPass (free soulbound membership pass, 1 per Agent ID holder).
///         Usage:
///           forge script script/DeployPass.s.sol --rpc-url <rpc>
///             --broadcast --private-key $KEY
///         The Agent ID address differs per network:
///           mainnet (56): 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///           testnet (97): MockAgentID 0xb2d0eBBA5518b874a49e449996b66805f9a93D0f
contract DeployPass is Script {
    function run() external {
        address agentId = vm.envAddress("AGENT_ID");
        vm.startBroadcast();
        HubPass pass = new HubPass(agentId);
        vm.stopBroadcast();
        console.log("HubPass deployed at:", address(pass));
        console.log("Agent ID used:", agentId);
    }
}
