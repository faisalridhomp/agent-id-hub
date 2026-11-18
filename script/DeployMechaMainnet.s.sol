// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MechaAgent} from "../src/MechaAgent.sol";

/// @notice Mainnet deploy: MechaAgent only, wired to the NEW mainnet Hub
///         (v3 redeploy) and the NEW mainnet HubPass. The HubPass is
///         deployed separately via script/DeployPass.s.sol.
///         Env: AGENT_ID (0x60b9262456de011f7d15a54cdd8c48baaa8b022f),
///         HUB_MAINNET, PASS_MAINNET, PRIVATE_KEY (never in the file).
contract DeployMechaMainnet is Script {
    function run() external {
        address agentId = vm.envAddress("AGENT_ID");
        address hub = vm.envAddress("HUB_MAINNET");
        address pass = vm.envAddress("PASS_MAINNET");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        MechaAgent mecha = new MechaAgent(agentId, hub, pass);
        vm.stopBroadcast();
        console.log("MechaAgent:", address(mecha));
        console.log("Hub used:", hub);
        console.log("Pass used:", pass);
        console.log("Agent ID used:", agentId);
    }
}
