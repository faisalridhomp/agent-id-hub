// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";
import {AgentIDHub} from "./AgentIDHub.sol";
import {HubPass} from "./HubPass.sol";

/// @title MechaAgent — free random-tier collectible for AgentID Hub
/// @notice One free mint per wallet (gas only), supply 666, TRADABLE.
///         A single random draw at mint decides BOTH the token number
///         (#0001–#0666, each used exactly once, Fisher-Yates pool) and
///         the rarity tier (Common 300 / Rare 200 / Epic 100 /
///         Legendary 50 / Mythic 16 — exact caps, enforced on-chain).
///         Eligibility: Founding Pass holders (pass tokenId 1–100) mint
///         directly, no streak needed. Everyone else needs bestStreak >= 7
///         AND phase 2 open (100 Founding mints done, or 7 days after
///         deploy). hasMinted is per wallet FOREVER — minting then
///         transferring the NFT away still cannot mint again.
///         Randomness is block-derived (prevrandao + minter + mint count +
///         prev blockhash): fair for a free collectible, not VRF-grade.
///         No owner, no pause, no upgrade — immutable after deploy.
contract MechaAgent is ERC721 {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 666;
    uint256 public constant FOUNDING_PHASE = 100;
    uint256 public constant PHASE2_DELAY = 7 days;
    uint256 public constant MIN_STREAK = 7;

    uint256 public immutable deployTime;
    IAgentID public immutable agentId;
    AgentIDHub public immutable hub;
    HubPass public immutable pass;

    uint256 public totalMinted;
    uint256 public remainingIds = MAX_SUPPLY;
    mapping(address => bool) public hasMinted;
    mapping(uint256 => uint256) public tierMinted; // tier 0..4 -> minted count
    mapping(uint256 => uint256) public tierOf; // tokenId -> tier 0..4
    mapping(uint256 => uint256) private _idPool; // Fisher-Yates swap map

    function tierCap(uint256 tier) public pure returns (uint256) {
        if (tier == 0) return 300;
        if (tier == 1) return 200;
        if (tier == 2) return 100;
        if (tier == 3) return 50;
        return 16;
    }

    error NotAgentIDHolder();
    error AlreadyMinted();
    error SoldOut();
    error Phase1FoundingOnly();
    error StreakTooShort();

    constructor(address _agentId, address _hub, address _pass)
        ERC721("Mecha Agent", "MECHA")
    {
        agentId = IAgentID(_agentId);
        hub = AgentIDHub(payable(_hub));
        pass = HubPass(_pass);
        deployTime = block.timestamp;
    }

    /// @notice Phase 2 (566 for 7-day streakers) opens once 100 Founding
    ///         mints are done, or 7 days after deploy — whichever first —
    ///         so the collection cannot stall if fewer than 100 Founding
    ///         holders ever mint.
    function phase2Open() public view returns (bool) {
        return totalMinted >= FOUNDING_PHASE
            || block.timestamp >= deployTime + PHASE2_DELAY;
    }

    function mint() external returns (uint256 tokenId, uint256 tier) {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIDHolder();
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (totalMinted >= MAX_SUPPLY) revert SoldOut();

        uint256 passId = pass.passOf(msg.sender);
        bool founding = passId >= 1 && passId <= FOUNDING_PHASE;
        if (!founding) {
            if (!phase2Open()) revert Phase1FoundingOnly();
            if (hub.getUser(msg.sender).bestStreak < MIN_STREAK) {
                revert StreakTooShort();
            }
        }

        hasMinted[msg.sender] = true;
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    msg.sender,
                    totalMinted,
                    blockhash(block.number - 1)
                )
            )
        );
        tokenId = _drawId(seed);
        tier = _drawTier(uint256(keccak256(abi.encodePacked(seed, "tier"))));
        tierOf[tokenId] = tier;
        tierMinted[tier]++;
        totalMinted++;
        _mint(msg.sender, tokenId);
    }

    /// @notice Fisher-Yates draw without replacement: picks one of the
    ///         still-unminted numbers 1..666 uniformly, each exactly once.
    ///         _idPool maps a pool index to the tokenId stored there (0 =
    ///         unset means the index still holds its own number, index+1).
    function _drawId(uint256 seed) internal returns (uint256 id) {
        uint256 idx = seed % remainingIds;
        id = _idPool[idx] == 0 ? idx + 1 : _idPool[idx];
        uint256 lastIdx = remainingIds - 1;
        uint256 last = _idPool[lastIdx] == 0 ? lastIdx + 1 : _idPool[lastIdx];
        _idPool[idx] = last;
        remainingIds--;
    }

    /// @notice Weighted roll over the 666 supply: Common [0,300), Rare
    ///         [300,500), Epic [500,600), Legendary [600,650), Mythic
    ///         [650,666). If the rolled tier is already at its cap, walk
    ///         to the next tier with room — final counts are exactly the
    ///         caps (some tier always has room while supply remains).
    function _drawTier(uint256 roll) internal view returns (uint256 tier) {
        uint256 r = roll % MAX_SUPPLY;
        tier = r < 300 ? 0 : r < 500 ? 1 : r < 600 ? 2 : r < 650 ? 3 : 4;
        while (tierMinted[tier] >= tierCap(tier)) {
            tier = (tier + 1) % 5;
        }
    }

    function tierName(uint256 tier) public pure returns (string memory) {
        if (tier == 0) return "COMMON";
        if (tier == 1) return "RARE";
        if (tier == 2) return "EPIC";
        if (tier == 3) return "LEGENDARY";
        return "MYTHIC";
    }

    function tierColors(uint256 tier)
        public
        pure
        returns (string memory light, string memory mid, string memory dark)
    {
        if (tier == 0) return ("#e5e7eb", "#9ca3af", "#6b7280");
        if (tier == 1) return ("#93c5fd", "#3b82f6", "#1d4ed8");
        if (tier == 2) return ("#d8b4fe", "#a855f7", "#7e22ce");
        if (tier == 3) return ("#f8e08a", "#f0b90b", "#a67c00");
        return ("#f9a8d4", "#ec4899", "#be185d");
    }

    /// @notice Glow animation: the rarer the tier, the brighter the glow
    ///         AND the faster the pulse. Common glows dim and slow (4s),
    ///         Mythic blazes bright and fast (1.5s). The SVG carries SMIL
    ///         <animate> tags, so marketplaces render it as a living,
    ///         pulsing image — no GIF file needed, it is all on-chain.
    function _glowParams(uint256 tier)
        internal
        pure
        returns (string memory dur, string memory vals)
    {
        if (tier == 0) return ("4s", "0.15;0.35;0.15");
        if (tier == 1) return ("3s", "0.2;0.5;0.2");
        if (tier == 2) return ("2.5s", "0.25;0.65;0.25");
        if (tier == 3) return ("2s", "0.3;0.8;0.3");
        return ("1.5s", "0.4;1;0.4");
    }

    /// @notice On-chain metadata: the mecha robot portrait, recoloured per
    ///         tier, with the token's own random number (#0001–#0666) top
    ///         right, the tier label bottom centre, and the holder's Agent
    ///         ID handle bottom left.
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        address holder = _ownerOf(tokenId);
        require(holder != address(0), "MechaAgent: nonexistent token");
        uint256 tier = tierOf[tokenId];
        (string memory light, string memory mid, string memory dark) =
            tierColors(tier);
        string memory name = tierName(tier);
        string memory handle = agentId.handleOf(holder);
        string memory num = _pad4(tokenId);
        (string memory dur, string memory vals) = _glowParams(tier);

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<defs>',
            '<linearGradient id="ch" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f5f8"/><stop offset="0.45" stop-color="#c3ccd4"/><stop offset="0.75" stop-color="#7d8894"/><stop offset="1" stop-color="#4a5560"/></linearGradient>',
            '<linearGradient id="cd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b98a5"/><stop offset="1" stop-color="#3a4550"/></linearGradient>',
            '<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="',
            light,
            '"/><stop offset="0.5" stop-color="',
            mid,
            '"/><stop offset="1" stop-color="',
            dark,
            '"/></linearGradient>',
            '<linearGradient id="vs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0891b2"/><stop offset="0.5" stop-color="#67e8f9"/><stop offset="1" stop-color="#0891b2"/></linearGradient>',
            '<radialGradient id="gl" cx="0.5" cy="0.3" r="0.65"><stop offset="0" stop-color="',
            mid,
            '" stop-opacity="0.28"/><stop offset="1" stop-color="',
            mid,
            '" stop-opacity="0"/></radialGradient>',
            '<filter id="sf" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>',
            '</defs>',
            '<rect width="400" height="400" fill="#070912"/><rect width="400" height="400" fill="url(#gl)"><animate attributeName="opacity" values="',
            vals,
            '" dur="',
            dur,
            '" repeatCount="indefinite"/></rect>',
            '<g stroke="',
            mid,
            '" stroke-width="1" opacity="0.12"><line x1="40" y1="60" x2="360" y2="60"/><line x1="40" y1="340" x2="360" y2="340"/><line x1="60" y1="40" x2="60" y2="360"/><line x1="340" y1="40" x2="340" y2="360"/></g>',
            '<circle cx="60" cy="60" r="2" fill="',
            mid,
            '" opacity="0.5"/><circle cx="340" cy="60" r="2" fill="',
            mid,
            '" opacity="0.5"/><circle cx="60" cy="340" r="2" fill="',
            mid,
            '" opacity="0.35"/><circle cx="340" cy="340" r="2" fill="',
            mid,
            '" opacity="0.35"/>',
            '<rect x="10" y="10" width="380" height="380" rx="20" fill="none" stroke="url(#gd)" stroke-width="2"/>',
            '<text x="30" y="38" font-size="11" letter-spacing="3" fill="',
            mid,
            '" font-family="sans-serif" font-weight="bold">AGENTID HUB</text>',
            '<text x="370" y="38" font-size="11" fill="#8a8f98" text-anchor="end" font-family="sans-serif">#',
            num,
            '</text>',
            '<line x1="200" y1="58" x2="200" y2="88" stroke="#c3ccd4" stroke-width="3"/>',
            '<circle cx="200" cy="54" r="6" fill="#67e8f9"/>',
            '<circle cx="200" cy="54" r="11" fill="#22d3ee" opacity="0.35" filter="url(#sf)"><animate attributeName="opacity" values="',
            vals,
            '" dur="',
            dur,
            '" repeatCount="indefinite"/></circle>',
            '<polygon points="200,78 258,100 272,148 262,214 238,250 162,250 138,214 128,148 142,100" fill="url(#ch)" stroke="#2a2f45" stroke-width="1.5"/>',
            '<polygon points="200,78 258,100 272,148 262,214 238,250 162,250 138,214 128,148 142,100" fill="none" stroke="url(#gd)" stroke-width="1.5" opacity="0.85"/>',
            '<polygon points="150,96 250,96 258,118 142,118" fill="#0b0e1a" opacity="0.55"/>',
            '<polygon points="200,78 226,86 214,96 186,96 174,86" fill="url(#gd)" opacity="0.9"/>',
            '<rect x="148" y="146" width="104" height="26" rx="12" fill="#22d3ee" opacity="0.35" filter="url(#sf)"><animate attributeName="opacity" values="',
            vals,
            '" dur="',
            dur,
            '" repeatCount="indefinite"/></rect>',
            '<polygon points="152,148 248,148 244,172 156,172" fill="url(#vs)"/>',
            '<line x1="162" y1="160" x2="238" y2="160" stroke="#e0f7ff" stroke-width="2.5" opacity="0.9"/>',
            '<circle cx="200" cy="160" r="4" fill="#ffffff"/>',
            '<g stroke="#3a4550" stroke-width="2.5" stroke-linecap="round"><line x1="152" y1="196" x2="176" y2="196"/><line x1="152" y1="206" x2="176" y2="206"/><line x1="152" y1="216" x2="176" y2="216"/><line x1="224" y1="196" x2="248" y2="196"/><line x1="224" y1="206" x2="248" y2="206"/><line x1="224" y1="216" x2="248" y2="216"/></g>',
            '<g fill="#3a4550"><rect x="188" y="228" width="4" height="14" rx="2"/><rect x="198" y="228" width="4" height="14" rx="2"/><rect x="208" y="228" width="4" height="14" rx="2"/></g>',
            '<circle cx="130" cy="176" r="15" fill="url(#cd)" stroke="url(#gd)" stroke-width="2"/>',
            '<circle cx="130" cy="176" r="6" fill="',
            mid,
            '"/>',
            '<circle cx="270" cy="176" r="15" fill="url(#cd)" stroke="url(#gd)" stroke-width="2"/>',
            '<circle cx="270" cy="176" r="6" fill="',
            mid,
            '"/>',
            '<polygon points="172,250 228,250 232,286 168,286" fill="url(#cd)"/>',
            '<line x1="170" y1="262" x2="230" y2="262" stroke="',
            mid,
            '" stroke-width="1.5" opacity="0.8"/>',
            '<line x1="172" y1="274" x2="228" y2="274" stroke="#2a2f45" stroke-width="1.5"/>',
            '<polygon points="52,336 158,288 186,312 118,362 62,362" fill="url(#ch)" stroke="#2a2f45" stroke-width="1.5"/>',
            '<polygon points="348,336 242,288 214,312 282,362 338,362" fill="url(#ch)" stroke="#2a2f45" stroke-width="1.5"/>',
            '<line x1="72" y1="330" x2="150" y2="300" stroke="url(#gd)" stroke-width="1.5" opacity="0.8"/>',
            '<line x1="328" y1="330" x2="250" y2="300" stroke="url(#gd)" stroke-width="1.5" opacity="0.8"/>',
            '<circle cx="100" cy="336" r="4" fill="#3a4550"/><circle cx="300" cy="336" r="4" fill="#3a4550"/>',
            '<circle cx="118" cy="326" r="4" fill="#3a4550"/><circle cx="282" cy="326" r="4" fill="#3a4550"/>',
            '<polygon points="200,306 232,324 232,352 200,370 168,352 168,324" fill="none" stroke="url(#gd)" stroke-width="2"/>',
            '<circle cx="200" cy="338" r="10" fill="',
            mid,
            '"/>',
            '<circle cx="200" cy="338" r="16" fill="',
            mid,
            '" opacity="0.25" filter="url(#sf)"><animate attributeName="opacity" values="',
            vals,
            '" dur="',
            dur,
            '" repeatCount="indefinite"/></circle>',
            '<text x="30" y="386" font-size="10" fill="#8a8f98" font-family="sans-serif">@',
            handle,
            '.ai</text>',
            '<text x="200" y="386" font-size="11" letter-spacing="4" text-anchor="middle" fill="',
            mid,
            '" font-family="sans-serif" font-weight="bold">',
            name,
            '</text></svg>'
        );

        string memory json = string.concat(
            '{"name":"Mecha Agent #',
            num,
            '","description":"Mecha Agent collectible for AgentID Hub. Free mint, one per wallet, supply 666. Tier and number are drawn at random when you mint: Common 300, Rare 200, Epic 100, Legendary 50, Mythic 16. Founding Pass holders mint directly; everyone else needs a 7-day streak.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Tier","value":"',
            name,
            '"},{"trait_type":"Number","value":"',
            num,
            '"},{"trait_type":"Holder","value":"',
            handle,
            '.ai"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _pad4(uint256 n) internal pure returns (string memory) {
        string memory s = n.toString();
        while (bytes(s).length < 4) {
            s = string.concat("0", s);
        }
        return s;
    }
}
