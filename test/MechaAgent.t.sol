// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentIDHub} from "../src/AgentIDHub.sol";
import {HubPass} from "../src/HubPass.sol";
import {MechaAgent} from "../src/MechaAgent.sol";
import {MockAgentID} from "../script/MockAgentID.sol";

contract MechaAgentTest is Test {
    MockAgentID agentId;
    AgentIDHub hub;
    HubPass pass;
    MechaAgent mecha;

    address alice = makeAddr("alice"); // Founding pass holder
    address bob = makeAddr("bob"); // Agent ID holder, no pass
    address carol = makeAddr("carol"); // holds NO Agent ID

    uint256 private _now;
    function _warpDays(uint256 d) internal {
        _now += d * 86400;
        vm.warp(_now);
    }

    function setUp() public {
        agentId = new MockAgentID();
        hub = new AgentIDHub(address(agentId));
        pass = new HubPass(address(agentId));
        mecha = new MechaAgent(address(agentId), address(hub), address(pass));
        _now = block.timestamp;
        agentId.giveId(alice, "alice");
        agentId.giveId(bob, "bob");
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        // Alice mints Founding pass #1.
        vm.prank(alice);
        pass.mint();
    }

    /// @notice Give `who` a 7-day check-in streak (7 check-ins, one per day).
    function _streak7(address who) internal {
        for (uint256 d = 0; d < 7; d++) {
            vm.prank(who);
            hub.checkIn();
            _warpDays(1);
        }
    }

    function testFoundingMintsDirectlyNoStreak() public {
        vm.prank(alice);
        (uint256 id, uint256 tier) = mecha.mint();
        assertGe(id, 1);
        assertLe(id, 666);
        assertLe(tier, 4);
        assertEq(mecha.totalMinted(), 1);
        assertTrue(mecha.hasMinted(alice));
        assertEq(mecha.ownerOf(id), alice);
        assertEq(mecha.tierOf(id), tier);
    }

    function testNonHolderReverts() public {
        vm.prank(carol);
        vm.expectRevert(MechaAgent.NotAgentIDHolder.selector);
        mecha.mint();
    }

    function testNonFoundingShortStreakReverts() public {
        // Phase 1: only Founding can mint.
        vm.prank(bob);
        vm.expectRevert(MechaAgent.Phase1FoundingOnly.selector);
        mecha.mint();
        // Phase 2 opens after 7 days, but bob still has no streak.
        _warpDays(7);
        assertTrue(mecha.phase2Open());
        vm.prank(bob);
        vm.expectRevert(MechaAgent.StreakTooShort.selector);
        mecha.mint();
    }

    function testNonFounding7DayStreakMintsAfterPhase2() public {
        _streak7(bob);
        assertTrue(mecha.phase2Open());
        vm.prank(bob);
        (uint256 id, ) = mecha.mint();
        assertEq(mecha.ownerOf(id), bob);
    }

    function testMintThenTransferStillCannotMintAgain() public {
        vm.prank(alice);
        (uint256 id, ) = mecha.mint();
        // Alice transfers the NFT away...
        vm.prank(alice);
        mecha.transferFrom(alice, bob, id);
        assertEq(mecha.ownerOf(id), bob);
        // ...and still cannot mint a second one.
        vm.prank(alice);
        vm.expectRevert(MechaAgent.AlreadyMinted.selector);
        mecha.mint();
    }

    function testTokenUriIsDataUri() public {
        vm.prank(alice);
        (uint256 id, ) = mecha.mint();
        string memory uri = mecha.tokenURI(id);
        bytes memory prefix = bytes("data:application/json;base64,");
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(bytes(uri)[i], prefix[i]);
        }
        assertGt(bytes(uri).length, 2000);
    }

    function testTokenUriNonexistentReverts() public {
        vm.expectRevert();
        mecha.tokenURI(1);
    }

    function testFullSupplyExactTierCapsAndUniqueNumbers() public {
        // 99 Founding mints (alice already holds pass #1 in setUp, so
        // loop passes are #2..#100) + 567 streak mints = 666 total.
        // Each streak holder does 7 check-ins on 7 consecutive days;
        // time only moves forward so every holder's streak is real.
        uint256 minted;
        bool[] memory seen = new bool[](667);
        for (uint256 i = 0; i < 666; i++) {
            address h = address(uint160(uint256(keccak256(abi.encodePacked("holder", i)))));
            agentId.giveId(h, string.concat("holder", vm.toString(i)));
            if (i < 99) {
                // Founding pass: loop passes are #2..#100.
                vm.prank(h);
                pass.mint();
            } else {
                _streak7(h);
            }
            vm.prank(h);
            (uint256 id, ) = mecha.mint();
            assertGe(id, 1);
            assertLe(id, 666);
            assertFalse(seen[id], "duplicate token number");
            seen[id] = true;
            minted++;
        }
        assertEq(minted, 666);
        assertEq(mecha.totalMinted(), 666);
        assertEq(mecha.remainingIds(), 0);
        // Exact tier caps: 300 / 200 / 100 / 50 / 16.
        assertEq(mecha.tierMinted(0), 300);
        assertEq(mecha.tierMinted(1), 200);
        assertEq(mecha.tierMinted(2), 100);
        assertEq(mecha.tierMinted(3), 50);
        assertEq(mecha.tierMinted(4), 16);
        // Sold out: one more holder cannot mint.
        address extra = makeAddr("extra");
        agentId.giveId(extra, "extra");
        _streak7(extra);
        vm.prank(extra);
        vm.expectRevert(MechaAgent.SoldOut.selector);
        mecha.mint();
    }
}
