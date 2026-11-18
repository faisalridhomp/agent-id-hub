// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title StreakBadge — soulbound ERC-721 badges for AgentID Hub check-in streaks
/// @notice Non-transferable by design (soulbound, like the Agent ID itself).
///         Only the AgentIDHub contract may mint. Token id is
///         keccak256(abi.encodePacked(holder, milestone)), so one badge per
///         holder per milestone. Metadata is fully on-chain (data URI JSON + SVG).
contract StreakBadge is ERC721 {
    using Strings for uint256;

    /// @notice The only contract allowed to mint badges.
    address public immutable hub;

    /// @notice Streak milestones that earn a badge (days).
    uint32 public constant MILESTONE_7 = 7;
    uint32 public constant MILESTONE_30 = 30;
    uint32 public constant MILESTONE_100 = 100;

    error NotHub();
    error InvalidMilestone();

    constructor(address hub_) ERC721("AgentID Hub Streak Badge", "AHB") {
        hub = hub_;
    }

    /// @notice Mint the milestone badge for `holder`. No-op if already minted
    ///         (a holder can hit the same milestone twice across broken streaks;
    ///         the second hit must not revert the check-in).
    /// @return minted True if a new badge was minted, false if already owned.
    function mintBadge(address holder, uint32 milestone) external returns (bool minted) {
        if (msg.sender != hub) revert NotHub();
        if (milestone != MILESTONE_7 && milestone != MILESTONE_30 && milestone != MILESTONE_100) {
            revert InvalidMilestone();
        }
        uint256 tokenId = uint256(keccak256(abi.encodePacked(holder, milestone)));
        if (_ownerOf(tokenId) != address(0)) return false;
        // Plain _mint (not _safeMint): the badge is soulbound and the
        // recipient is a verified Agent ID holder. _safeMint would call
        // onERC721Received on contract wallets and a recipient without that
        // hook would revert the whole check-in on milestone days (Groq
        // review 2026-11-18). No receiver check is needed here.
        _mint(holder, tokenId);
        return true;
    }

    /// @notice Soulbound: only minting (from == 0) and burning (to == 0) are
    ///         allowed. Any transfer between two live addresses reverts.
    ///         OpenZeppelin v5 routes all mint/transfer/burn through _update.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "StreakBadge: soulbound");
        return super._update(to, tokenId, auth);
    }

    /// @notice On-chain metadata: name, description, milestone + holder traits,
    ///         and a minimal inline SVG. No external dependency.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address holder = _ownerOf(tokenId);
        require(holder != address(0), "StreakBadge: nonexistent token");
        uint32 milestone = _milestoneOf(tokenId, holder);
        string memory name_ = string.concat(
            "AgentID Hub Streak Badge - ", uint256(milestone).toString(), " Days"
        );
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">',
            '<rect width="400" height="400" fill="#0b0e1a"/>',
            '<circle cx="200" cy="180" r="110" fill="#f0b90b"/>',
            '<text x="200" y="200" font-size="72" text-anchor="middle" fill="#0b0e1a" font-family="sans-serif" font-weight="bold">',
            uint256(milestone).toString(),
            '</text>',
            '<text x="200" y="300" font-size="28" text-anchor="middle" fill="#ffffff" font-family="sans-serif">DAY STREAK</text>',
            '<text x="200" y="340" font-size="18" text-anchor="middle" fill="#8a8f98" font-family="sans-serif">AgentID Hub</text>',
            "</svg>"
        );
        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"',
                    name_,
                    '","description":"Soulbound badge for a ',
                    uint256(milestone).toString(),
                    '-day daily check-in streak on AgentID Hub. Tied to one Agent ID, non-transferable.","attributes":[{"trait_type":"Milestone (days)","value":',
                    uint256(milestone).toString(),
                    '},{"trait_type":"Holder","value":"',
                    Strings.toHexString(holder),
                    '"}],"image":"data:image/svg+xml;base64,',
                    Base64.encode(bytes(svg)),
                    '"}'
                )
            )
        );
        return string.concat("data:application/json;base64,", json);
    }

    /// @dev Recover the milestone from the token id by testing the three known
    ///      milestones. tokenId is keccak256(holder, milestone), so this is exact.
    function _milestoneOf(uint256 tokenId, address holder) internal pure returns (uint32) {
        if (tokenId == uint256(keccak256(abi.encodePacked(holder, MILESTONE_7)))) return MILESTONE_7;
        if (tokenId == uint256(keccak256(abi.encodePacked(holder, MILESTONE_30)))) return MILESTONE_30;
        return MILESTONE_100;
    }
}
