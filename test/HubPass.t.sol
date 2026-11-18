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

    function testPassIsTradable() public {
        vm.prank(alice);
        pass.mint();
        vm.prank(alice);
        pass.transferFrom(alice, bob, 1);
        assertEq(pass.ownerOf(1), bob);
        assertEq(pass.passOf(alice), 1); // passOf tracks the original minter's token id
        assertEq(pass.balanceOf(bob), 1);
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
