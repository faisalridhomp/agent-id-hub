// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";

/// @title StreakBadge — soulbound ERC-721 badges for AgentID Hub check-in streaks
/// @notice Non-transferable by design (soulbound, like the Agent ID itself).
///         Only the AgentIDHub contract may mint. Token id is
///         keccak256(abi.encodePacked(holder, milestone)), so one badge per
///         holder per milestone. Metadata is fully on-chain (data URI JSON + SVG).
///         Tiers: 7 days = BRONZE (plain metal), 30 days = SILVER,
///         100 days = GOLD — same premium card style as the Hub Pass.
contract StreakBadge is ERC721 {
    using Strings for uint256;

    /// @notice The only contract allowed to mint badges.
    address public immutable hub;
    /// @notice The Agent ID contract, for resolving the holder's handle in metadata.
    IAgentID public immutable agentId;

    /// @notice Streak milestones that earn a badge (days).
    uint32 public constant MILESTONE_7 = 7;
    uint32 public constant MILESTONE_30 = 30;
    uint32 public constant MILESTONE_100 = 100;
    uint32 public constant MILESTONE_1000 = 1000;

    error NotHub();
    error InvalidMilestone();

    constructor(address hub_, address agentId_) ERC721("AgentID Hub Streak Badge", "AHB") {
        hub = hub_;
        agentId = IAgentID(agentId_);
    }

    /// @notice Mint the milestone badge for `holder`. No-op if already minted
    ///         (a holder can hit the same milestone twice across broken streaks;
    ///         the second hit must not revert the check-in).
    /// @return minted True if a new badge was minted, false if already owned.
    function mintBadge(address holder, uint32 milestone) external returns (bool minted) {
        if (msg.sender != hub) revert NotHub();
        if (milestone != MILESTONE_7 && milestone != MILESTONE_30 && milestone != MILESTONE_100 && milestone != MILESTONE_1000) {
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

    /// @notice Tier by milestone: 7 = BRONZE (plain metal), 30 = SILVER,
    ///         100 = GOLD, 1000 = DIAMOND. Returns (name, mid color, dark color).
    function _tier(uint32 milestone)
        internal
        pure
        returns (string memory name, string memory b, string memory c)
    {
        if (milestone == MILESTONE_7) return ("BRONZE", "#cd7f32", "#7a4a1e");
        if (milestone == MILESTONE_30) return ("SILVER", "#c0c0c0", "#7d7d7d");
        if (milestone == MILESTONE_100) return ("GOLD", "#f0b90b", "#a67c00");
        return ("DIAMOND", "#7dd3fc", "#0284c7");
    }

    /// @notice On-chain metadata: premium tiered card SVG (metal-gradient
    ///         border, hexagon emblem with the milestone number, tier label,
    ///         holder handle), name, description, milestone + tier + holder
    ///         traits. No external dependency.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address holder = _ownerOf(tokenId);
        require(holder != address(0), "StreakBadge: nonexistent token");
        return _buildTokenURI(tokenId, holder);
    }

    /// @dev Split from tokenURI to avoid "stack too deep": builds the full
    ///      data-URI JSON (SVG image embedded, base64).
    function _buildTokenURI(uint256 tokenId, address holder) internal view returns (string memory) {
        uint32 milestone = _milestoneOf(tokenId, holder);
        (string memory tier, string memory b, string memory c) = _tier(milestone);
        string memory handle = agentId.handleOf(holder);
        string memory ms = uint256(milestone).toString();
        string memory svg = string.concat(_badgeSvgTop(b, c), _badgeSvgBottom(tier, b, handle, ms));
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(
                bytes(
                    string.concat(
                        '{"name":"AgentID Hub Streak Badge - ',
                        ms,
                        ' Days","description":"Soulbound badge for a ',
                        ms,
                        '-day daily check-in streak on AgentID Hub. Tier: ',
                        tier,
                        '. Tied to one Agent ID, non-transferable.","attributes":[{"trait_type":"Milestone (days)","value":',
                        ms,
                        '},{"trait_type":"Tier","value":"',
                        tier,
                        '"},{"trait_type":"Holder","value":"',
                        Strings.toHexString(holder),
                        '"},{"trait_type":"Handle","value":"',
                        handle,
                        '"}],"image":"data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '"}'
                    )
                )
            )
        );
    }

    /// @dev SVG top half: defs, background, glow, card frame, header.
    function _badgeSvgTop(string memory b, string memory c) internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<defs>',
            '<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="',
            b,
            '"/><stop offset="1" stop-color="',
            c,
            '"/></linearGradient>',
            '<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2036"/><stop offset="1" stop-color="#0b0e1a"/></linearGradient>',
            '<radialGradient id="glow" cx="0.5" cy="0.25" r="0.6"><stop offset="0" stop-color="',
            b,
            '" stop-opacity="0.30"/><stop offset="1" stop-color="',
            b,
            '" stop-opacity="0"/></radialGradient>',
            '</defs>',
            '<rect width="400" height="400" fill="#070912"/>',
            '<rect width="400" height="400" fill="url(#glow)"/>',
            '<circle cx="52" cy="348" r="1.5" fill="',
            b,
            '" opacity="0.5"/><circle cx="352" cy="52" r="1.5" fill="',
            b,
            '" opacity="0.5"/><circle cx="368" cy="330" r="1.5" fill="',
            b,
            '" opacity="0.35"/><circle cx="36" cy="66" r="1.5" fill="',
            b,
            '" opacity="0.35"/>',
            '<rect x="28" y="28" width="344" height="344" rx="22" fill="url(#card)" stroke="url(#metal)" stroke-width="2"/>',
            '<polygon points="28,120 120,28 160,28 28,160" fill="#ffffff" opacity="0.03"/>',
            '<polygon points="330,340 360,323 360,357 330,372" fill="none" stroke="',
            b,
            '" stroke-width="1" opacity="0.10"/>',
            '<polygon points="52,330 72,319 72,341 52,352" fill="none" stroke="',
            b,
            '" stroke-width="1" opacity="0.10"/>',
            '<text x="52" y="70" font-size="13" letter-spacing="3" fill="',
            b,
            '" font-family="sans-serif" font-weight="bold">AGENTID HUB</text>',
            '<text x="348" y="70" font-size="12" fill="#8a8f98" text-anchor="end" font-family="sans-serif">STREAK BADGE</text>'
        );
    }

    /// @dev SVG bottom half: ghost number, hexagon emblem, title, tier,
    ///      divider, holder handle, fine print.
    function _badgeSvgBottom(string memory tier, string memory b, string memory handle, string memory ms)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '<text x="200" y="196" font-size="110" text-anchor="middle" fill="#ffffff" opacity="0.05" font-family="sans-serif" font-weight="bold">',
            ms,
            '</text>',
            '<polygon points="200,102 247,129 247,183 200,210 153,183 153,129" fill="none" stroke="url(#metal)" stroke-width="2.5"/>',
            '<polygon points="200,118 233,137 233,175 200,194 167,175 167,137" fill="',
            b,
            '" opacity="0.12"/>',
            '<text x="200" y="172" font-size="32" text-anchor="middle" fill="',
            b,
            '" font-family="sans-serif" font-weight="bold">',
            ms,
            '</text>',
            '<text x="200" y="254" font-size="30" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="bold" letter-spacing="1">',
            ms,
            ' DAY STREAK</text>',
            '<text x="200" y="280" font-size="12" letter-spacing="4" text-anchor="middle" fill="',
            b,
            '" font-family="sans-serif" font-weight="bold">',
            tier,
            '</text>',
            '<line x1="70" y1="298" x2="330" y2="298" stroke="#2a2f45" stroke-width="1"/>',
            '<text x="52" y="328" font-size="20" fill="#ffffff" font-family="sans-serif" font-weight="bold">',
            handle,
            '.ai</text>',
            '<text x="348" y="328" font-size="12" fill="#8a8f98" text-anchor="end" font-family="sans-serif">SOULBOUND</text>',
            '<text x="200" y="356" font-size="9" letter-spacing="2" text-anchor="middle" fill="#5a6076" font-family="sans-serif">STREAK BADGE &#183; NON-TRANSFERABLE</text>',
            '</svg>'
        );
    }

    /// @dev Recover the milestone from the token id by testing the three known
    ///      milestones. tokenId is keccak256(holder, milestone), so this is exact.
    function _milestoneOf(uint256 tokenId, address holder) internal pure returns (uint32) {
        if (tokenId == uint256(keccak256(abi.encodePacked(holder, MILESTONE_7)))) return MILESTONE_7;
        if (tokenId == uint256(keccak256(abi.encodePacked(holder, MILESTONE_30)))) return MILESTONE_30;
        if (tokenId == uint256(keccak256(abi.encodePacked(holder, MILESTONE_100)))) return MILESTONE_100;
        return MILESTONE_1000;
    }
}
