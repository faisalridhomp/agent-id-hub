// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {AgentIDHub} from "../src/AgentIDHub.sol";
import {StreakBadge} from "../src/StreakBadge.sol";

/// @notice SHORT integration test against the REAL Agent ID contract on a BSC
///         mainnet fork. Run with:
///         forge test --match-contract AgentIDHubForkTest --fork-url <BSC RPC>
///         Kept to a handful of calls by design (shared small VM).
///         Verified live 2026-11-18: jackdefi.ai is held by
///         0x3Bc96b2528f686F27b04897bD819bC10D8981B1b.
contract AgentIDHubForkTest is Test {
    address constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address constant JACKDEFI = 0x3Bc96b2528f686F27b04897bD819bC10D8981B1b;

    AgentIDHub hub;
    StreakBadge badge;

    function setUp() public {
        hub = new AgentIDHub(AGENT_ID);
        badge = hub.badge();
    }

    function testRealCheckInAsJackdefi() public {
        vm.prank(JACKDEFI);
        hub.checkIn();
        AgentIDHub.UserStats memory s = hub.getUser(JACKDEFI);
        assertEq(s.currentStreak, 1);
        assertEq(s.totalCheckIns, 1);
    }

    function testRealTipByNameToJackdefi() public {
        address tipper = makeAddr("tipper");
        vm.deal(tipper, 1 ether);
        uint256 before = JACKDEFI.balance;
        vm.prank(tipper);
        hub.tipByName{value: 0.01 ether}("jackdefi");
        assertEq(JACKDEFI.balance, before + 0.01 ether);
        (uint256 received,, uint256 unique) = hub.getTipTotals(JACKDEFI);
        assertEq(received, 0.01 ether);
        assertEq(unique, 1);
    }

    function testRealUnknownHandleReverts() public {
        address tipper = makeAddr("tipper2");
        vm.deal(tipper, 1 ether);
        vm.prank(tipper);
        vm.expectRevert(AgentIDHub.UnknownHandle.selector);
        hub.tipByName{value: 0.01 ether}("zzzznotreal12345");
    }
}
