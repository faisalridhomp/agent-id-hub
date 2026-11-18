// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {HubPass} from "../src/HubPass.sol";
import {MockAgentID} from "../script/MockAgentID.sol";

contract HubPassTest is Test {
    MockAgentID agentId;
    HubPass pass;

    address alice = makeAddr("alice"); // holds "alice"
    address bob = makeAddr("bob"); // holds "bob"
    address carol = makeAddr("carol"); // holds NO Agent ID

    function setUp() public {
        agentId = new MockAgentID();
        pass = new HubPass(address(agentId));
        agentId.giveId(alice, "alice");
        agentId.giveId(bob, "bob");
    }

    function testMintFreeForHolder() public {
        vm.prank(alice);
        uint256 id = pass.mint();
        assertEq(id, 1);
        assertEq(pass.ownerOf(1), alice);
        assertEq(pass.passOf(alice), 1);
        assertTrue(pass.hasPass(alice));
        assertEq(pass.totalMinted(), 1);
        assertEq(pass.balanceOf(alice), 1);
    }

    function testMintSecondHolderGetsId2() public {
        vm.prank(alice);
        pass.mint();
        vm.prank(bob);
        uint256 id = pass.mint();
        assertEq(id, 2);
        assertEq(pass.totalMinted(), 2);
    }

    function testMintTwiceReverts() public {
        vm.prank(alice);
        pass.mint();
        vm.prank(alice);
        vm.expectRevert(HubPass.AlreadyMinted.selector);
        pass.mint();
    }

    function testMintNonHolderReverts() public {
        vm.prank(carol);
        vm.expectRevert(HubPass.NoAgentId.selector);
        pass.mint();
    }

    function testFoundingPassIsSoulbound() public {
        vm.prank(alice);
        pass.mint(); // token 1 = Founding
        vm.prank(alice);
        vm.expectRevert("HubPass: founding pass is soulbound");
        pass.transferFrom(alice, bob, 1);
    }

    function testMemberPassIsTradable() public {
        // Mint 101 passes: tokens 1-100 Founding, token 101 Member.
        for (uint256 i = 0; i < 101; i++) {
            address h = address(uint160(uint256(keccak256(abi.encodePacked("holder", i)))));
            agentId.giveId(h, string.concat("holder", vm.toString(i)));
            vm.prank(h);
            pass.mint();
        }
        assertEq(pass.totalMinted(), 101);
        address holder100 = address(uint160(uint256(keccak256(abi.encodePacked("holder", uint256(100))))));
        vm.prank(holder100);
        pass.transferFrom(holder100, bob, 101); // Member pass transfers freely
        assertEq(pass.ownerOf(101), bob);
        // ...but the Founding pass (token 1) still cannot move.
        address holder0 = address(uint160(uint256(keccak256(abi.encodePacked("holder", uint256(0))))));
        vm.prank(holder0);
        vm.expectRevert("HubPass: founding pass is soulbound");
        pass.transferFrom(holder0, bob, 1);
    }

    function testTokenUriIsDataUri() public {
        vm.prank(alice);
        pass.mint();
        string memory uri = pass.tokenURI(1);
        assertGt(bytes(uri).length, 100);
        assertEq(bytes(uri)[0], bytes1("d")); // "data:application/json;base64,..."
    }

    function testTokenUriNonexistentReverts() public {
        vm.expectRevert("HubPass: nonexistent token");
        pass.tokenURI(999);
    }

    function testDeployZeroAgentIdReverts() public {
        vm.expectRevert(HubPass.ZeroAgentId.selector);
        new HubPass(address(0));
    }
}
