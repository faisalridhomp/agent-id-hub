// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {HubPass} from "../src/HubPass.sol";
import {MechaAgent} from "../src/MechaAgent.sol";

/// @notice Testnet deploy: fresh HubPass (Founding soulbound) + MechaAgent,
///         wired to the v3 testnet Hub and the MockAgentID (deployer holds
///         mock handle "tester"). PRIVATE_KEY via env, never in the file.
contract DeployMecha is Script {
    address constant MOCK_AGENT_ID =
        0xe5259B47A176ac5ceDc9370b44DEc454b153DC03;
    address constant HUB_TESTNET =
        0x5C86Bc350D5c2ae8eD8BaeBB662056F89007B82B;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        HubPass pass = new HubPass(MOCK_AGENT_ID);
        MechaAgent mecha =
            new MechaAgent(MOCK_AGENT_ID, HUB_TESTNET, address(pass));
        vm.stopBroadcast();
        console.log("HubPass:", address(pass));
        console.log("MechaAgent:", address(mecha));
    }
}
