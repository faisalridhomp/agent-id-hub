// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {AgentIDHub} from "../src/AgentIDHub.sol";
import {StreakBadge} from "../src/StreakBadge.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";

/// @notice Minimal stand-in for the real Agent ID contract on testnet/local.
///         Mirrors the verified mainnet behaviour: ownerOfHandle returns
///         address(0) (no revert) for unknown handles.
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

/// @notice Rejects all incoming BNB (tests the tip-failure path).
contract Rejector {
    receive() external payable {
        revert("nope");
    }
}

contract AgentIDHubTest is Test {
    MockAgentID agentId;
    StreakBadge badge;
    AgentIDHub hub;

    address alice = makeAddr("alice"); // holds "alice"
    address bob = makeAddr("bob"); // holds "bob"
    address carol = makeAddr("carol"); // holds NO Agent ID

    function setUp() public {
        agentId = new MockAgentID();
        // The hub deploys its own badge in the constructor.
        hub = new AgentIDHub(address(agentId));
        badge = hub.badge();
        agentId.giveId(alice, "alice");
        agentId.giveId(bob, "bob");
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
    }

    function testCheckInFirstDay() public {
        vm.prank(alice);
        hub.checkIn();
        AgentIDHub.UserStats memory s = hub.getUser(alice);
        assertEq(s.currentStreak, 1);
        assertEq(s.bestStreak, 1);
        assertEq(s.totalCheckIns, 1);
    }

    function testCheckInTwiceSameDayReverts() public {
        vm.prank(alice);
        hub.checkIn();
        vm.prank(alice);
        vm.expectRevert(AgentIDHub.AlreadyCheckedInToday.selector);
        hub.checkIn();
    }

    function testCheckInNonHolderReverts() public {
        vm.prank(carol);
        vm.expectRevert(AgentIDHub.NoAgentId.selector);
        hub.checkIn();
    }

    function testStreakGrowsAcrossDays() public {
        vm.prank(alice);
        hub.checkIn();
        vm.warp(block.timestamp + 86400);
        vm.prank(alice);
        hub.checkIn();
        assertEq(hub.getUser(alice).currentStreak, 2);
    }

    function testMissedDayResetsStreak() public {
        vm.prank(alice);
        hub.checkIn();
        vm.warp(block.timestamp + 86400);
        vm.prank(alice);
        hub.checkIn();
        assertEq(hub.getUser(alice).currentStreak, 2);
        vm.warp(block.timestamp + 2 * 86400); // skip a day
        vm.prank(alice);
        hub.checkIn();
        AgentIDHub.UserStats memory s = hub.getUser(alice);
        assertEq(s.currentStreak, 1);
        assertEq(s.bestStreak, 2);
    }

    function testBadgeAt7DaysAndSoulbound() public {
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(alice);
            hub.checkIn();
            vm.warp(block.timestamp + 86400);
        }
        uint256 tokenId = uint256(keccak256(abi.encodePacked(alice, uint32(7))));
        assertEq(badge.ownerOf(tokenId), alice);
        // Soulbound: transfer must revert.
        vm.prank(alice);
        vm.expectRevert("StreakBadge: soulbound");
        badge.transferFrom(alice, bob, tokenId);
        // Only the hub can mint directly.
        vm.expectRevert(StreakBadge.NotHub.selector);
        badge.mintBadge(bob, 7);
    }

    function testBadgeNotDoubleMintedAcrossBrokenStreaks() public {
        // Hit 7, break, hit 7 again: second 7-day check-in must NOT revert.
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(alice);
            hub.checkIn();
            vm.warp(block.timestamp + 86400);
        }
        vm.warp(block.timestamp + 2 * 86400); // break streak
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(alice);
            hub.checkIn();
            vm.warp(block.timestamp + 86400);
        }
        assertEq(hub.getUser(alice).totalCheckIns, 14);
    }

    function testTipByNameForwardsFullValue() public {
        uint256 before = bob.balance;
        vm.prank(alice);
        hub.tipByName{value: 0.5 ether}("bob");
        assertEq(bob.balance, before + 0.5 ether);
        assertEq(address(hub).balance, 0);
        (uint256 received,, uint256 unique) = hub.getTipTotals(bob);
        assertEq(received, 0.5 ether);
        assertEq(unique, 1);
        (, uint256 sentAlice,) = hub.getTipTotals(alice);
        assertEq(sentAlice, 0.5 ether);
    }

    function testTipUnknownHandleRevertsNoStateChange() public {
        vm.prank(alice);
        vm.expectRevert(AgentIDHub.UnknownHandle.selector);
        hub.tipByName{value: 0.1 ether}("zzzznotreal12345");
        (uint256 received,,) = hub.getTipTotals(alice);
        assertEq(received, 0);
    }

    function testTipZeroValueReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentIDHub.ZeroTip.selector);
        hub.tipByName{value: 0}("bob");
    }

    function testTipToRejectorRevertsAtomically() public {
        Rejector r = new Rejector();
        agentId.giveId(address(r), "rejector");
        uint256 sentBefore = hub.totalTippedSent(alice);
        vm.prank(alice);
        vm.expectRevert(AgentIDHub.TipTransferFailed.selector);
        hub.tipByName{value: 0.1 ether}("rejector");
        assertEq(hub.totalTippedSent(alice), sentBefore);
        assertEq(address(hub).balance, 0);
    }

    function testSelfTipCountsOneUniqueTipper() public {
        // Self-tips are rejected outright (Superbot review): no point paying
        // gas to tip yourself, and it keeps the unique-tipper count honest.
        vm.prank(alice);
        vm.expectRevert(AgentIDHub.SelfTip.selector);
        hub.tipByName{value: 0.1 ether}("alice");
    }

    function testEffectiveStreak() public {
        vm.prank(alice);
        hub.checkIn();
        assertEq(hub.effectiveStreak(alice), 1);
        vm.warp(block.timestamp + 86400);
        assertEq(hub.effectiveStreak(alice), 1); // yesterday: still alive
        vm.warp(block.timestamp + 86400); // missed a day
        assertEq(hub.effectiveStreak(alice), 0);
        assertEq(hub.getUser(alice).currentStreak, 1); // stored value is stale
    }

    function testCheckInWorksWhilePaused() public {
        hub.pause();
        vm.prank(alice);
        hub.checkIn(); // check-ins are unpausable by design
        assertEq(hub.getUser(alice).currentStreak, 1);
        vm.prank(alice);
        vm.expectRevert();
        hub.tipByName{value: 0.1 ether}("bob"); // tips ARE paused
    }

    function testDeployZeroAgentIdReverts() public {
        vm.expectRevert(AgentIDHub.ZeroAgentId.selector);
        new AgentIDHub(address(0));
    }

    function testPauseBlocksTipOnly() public {
        hub.pause();
        vm.prank(alice);
        hub.checkIn(); // check-ins stay live while paused, by design
        vm.prank(alice);
        vm.expectRevert();
        hub.tipByName{value: 0.1 ether}("bob");
        hub.unpause();
        vm.prank(alice);
        hub.tipByName{value: 0.1 ether}("bob");
        assertEq(hub.totalTippedReceived(bob), 0.1 ether);
    }

    function testPlainBnbTransferRejected() public {
        vm.prank(alice);
        (bool ok,) = address(hub).call{value: 0.01 ether}("");
        assertFalse(ok);
        assertEq(address(hub).balance, 0);
    }
}
