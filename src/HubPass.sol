// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";

/// @title HubPass — free membership pass for AgentID Hub
/// @notice One free mint per Agent ID holder (gas only). Two tiers:
///         FOUNDING (first 100 mints) is SOULBOUND — it proves you were
///         early and cannot be bought or sold. MEMBER (mint 101+) is
///         TRADABLE — hold it for status or sell it. The pass always shows
///         its current holder's handle. Minting is itself an on-chain Agent
///         ID interaction, so every mint grows the hub activity the
///         hackathon ranks on. No fee, no supply cap, no owner powers at
///         all — the contract cannot be paused, upgraded, or changed
///         after deploy.
contract HubPass is ERC721 {
    using Strings for uint256;

    /// @notice The Agent ID contract (immutable).
    IAgentID public immutable agentId;

    /// @notice Total passes minted (also the next token id).
    uint256 public totalMinted;
    /// @notice tokenId held by an address (0 = no pass).
    mapping(address => uint256) public passOf;

    event PassMinted(address indexed holder, uint256 indexed tokenId, string handle);

    error NoAgentId();
    error AlreadyMinted();
    error ZeroAgentId();

    constructor(address agentId_) ERC721("AgentID Hub Pass", "AHP") {
        if (agentId_ == address(0)) revert ZeroAgentId();
        agentId = IAgentID(agentId_);
    }

    /// @notice Mint your free pass. One per Agent ID holder, forever.
    ///         Free — only gas. Reverts if you hold no Agent ID or if you
    ///         already minted.
    function mint() external returns (uint256 tokenId) {
        if (agentId.balanceOf(msg.sender) == 0) revert NoAgentId();
        if (passOf[msg.sender] != 0) revert AlreadyMinted();
        tokenId = ++totalMinted;
        passOf[msg.sender] = tokenId;
        // Plain _mint (not _safeMint): same rationale as StreakBadge — the
        // recipient is a verified Agent ID holder, and _safeMint would call
        // onERC721Received on contract wallets, reverting the mint for a
        // holder without that hook.
        _mint(msg.sender, tokenId);
        emit PassMinted(msg.sender, tokenId, agentId.handleOf(msg.sender));
    }

    /// @notice True if the address holds a pass.
    function hasPass(address holder) external view returns (bool) {
        return passOf[holder] != 0;
    }

    /// @notice Founding passes (tokenId <= 100) are SOULBOUND — they prove
    ///         early membership and cannot be transferred. Member passes
    ///         (tokenId > 100) are freely tradable. Only minting (from == 0)
    ///         and burning (to == 0) bypass the check. OpenZeppelin v5
    ///         routes all mint/transfer/burn through _update.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && tokenId <= 100) {
            revert("HubPass: founding pass is soulbound");
        }
        return super._update(to, tokenId, auth);
    }

    /// @notice On-chain metadata: premium member-card SVG (gold border,
    ///         hexagon AI emblem, chip, ghost member number, tier label),
    ///         name, description, holder + handle + tier traits.
    ///         Tier: first 100 mints are FOUNDING MEMBER, the rest MEMBER.
    ///         No external dependency.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address holder = _ownerOf(tokenId);
        require(holder != address(0), "HubPass: nonexistent token");
        string memory handle = agentId.handleOf(holder);
        string memory tier = tokenId <= 100 ? "FOUNDING MEMBER" : "MEMBER";
        string memory transfer = tokenId <= 100 ? "SOULBOUND" : "TRADABLE";
        string memory num = _pad4(tokenId);
        string memory ghost = _pad2(tokenId);
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<defs>',
            '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8e08a"/><stop offset="0.5" stop-color="#f0b90b"/><stop offset="1" stop-color="#a67c00"/></linearGradient>',
            '<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2036"/><stop offset="1" stop-color="#0b0e1a"/></linearGradient>',
            '<radialGradient id="glow" cx="0.5" cy="0.25" r="0.6"><stop offset="0" stop-color="#f0b90b" stop-opacity="0.30"/><stop offset="1" stop-color="#f0b90b" stop-opacity="0"/></radialGradient>',
            '</defs>',
            '<rect width="400" height="400" fill="#070912"/>',
            '<rect width="400" height="400" fill="url(#glow)"/>',
            '<circle cx="52" cy="348" r="1.5" fill="#f0b90b" opacity="0.5"/><circle cx="352" cy="52" r="1.5" fill="#f0b90b" opacity="0.5"/><circle cx="368" cy="330" r="1.5" fill="#f0b90b" opacity="0.35"/><circle cx="36" cy="66" r="1.5" fill="#f0b90b" opacity="0.35"/>',
            '<rect x="28" y="28" width="344" height="344" rx="22" fill="url(#card)" stroke="url(#gold)" stroke-width="2"/>',
            '<polygon points="28,120 120,28 160,28 28,160" fill="#ffffff" opacity="0.03"/>',
            '<polygon points="330,340 360,323 360,357 330,372" fill="none" stroke="#f0b90b" stroke-width="1" opacity="0.10"/>',
            '<polygon points="52,330 72,319 72,341 52,352" fill="none" stroke="#f0b90b" stroke-width="1" opacity="0.10"/>',
            '<text x="52" y="70" font-size="13" letter-spacing="3" fill="#f0b90b" font-family="sans-serif" font-weight="bold">AGENTID HUB</text>',
            '<text x="348" y="70" font-size="12" fill="#8a8f98" text-anchor="end" font-family="sans-serif">EST. 2026</text>',
            '<rect x="52" y="86" width="34" height="26" rx="6" fill="none" stroke="url(#gold)" stroke-width="1.5"/>',
            '<line x1="52" y1="95" x2="86" y2="95" stroke="#f0b90b" stroke-width="1" opacity="0.7"/>',
            '<line x1="52" y1="103" x2="86" y2="103" stroke="#f0b90b" stroke-width="1" opacity="0.7"/>',
            '<line x1="69" y1="86" x2="69" y2="112" stroke="#f0b90b" stroke-width="1" opacity="0.7"/>',
            '<text x="200" y="196" font-size="110" text-anchor="middle" fill="#ffffff" opacity="0.05" font-family="sans-serif" font-weight="bold">',
            ghost,
            '</text>',
            '<polygon points="200,102 247,129 247,183 200,210 153,183 153,129" fill="none" stroke="url(#gold)" stroke-width="2.5"/>',
            '<polygon points="200,118 233,137 233,175 200,194 167,175 167,137" fill="#f0b90b" opacity="0.12"/>',
            '<text x="200" y="170" font-size="30" text-anchor="middle" fill="#f0b90b" font-family="sans-serif" font-weight="bold">AI</text>',
            '<text x="200" y="254" font-size="34" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="bold" letter-spacing="2">HUB PASS</text>',
            '<text x="200" y="280" font-size="12" letter-spacing="4" text-anchor="middle" fill="#f0b90b" font-family="sans-serif" font-weight="bold">',
            tier,
            '</text>',
            '<line x1="70" y1="298" x2="330" y2="298" stroke="#2a2f45" stroke-width="1"/>',
            '<text x="52" y="328" font-size="20" fill="#ffffff" font-family="sans-serif" font-weight="bold">',
            handle,
            '.ai</text>',
            '<text x="348" y="328" font-size="14" fill="#f0b90b" text-anchor="end" font-family="monospace">#',
            num,
            '</text>',
            '<text x="200" y="356" font-size="9" letter-spacing="2" text-anchor="middle" fill="#5a6076" font-family="sans-serif">ONE PER WALLET &#183; ',
            transfer,
            ' &#183; FREE MINT</text>',
            '</svg>'
        );
        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"AgentID Hub Pass - ',
                    handle,
                    '.ai","description":"Membership pass for AgentID Hub. Free mint, one per Binance Agent ID holder. Founding Member passes (first 100 mints) are soulbound and non-transferable; Member passes are tradable - hold it for status or sell it.","attributes":[{"trait_type":"Holder","value":"',
                    Strings.toHexString(holder),
                    '"},{"trait_type":"Handle","value":"',
                    handle,
                    '"},{"trait_type":"Tier","value":"',
                    tier,
                    '"}],"image":"data:image/svg+xml;base64,',
                    Base64.encode(bytes(svg)),
                    '"}'
                )
            )
        );
        return string.concat("data:application/json;base64,", json);
    }

    /// @dev Zero-pad a number to 2 digits ("01", "12", "123").
    function _pad2(uint256 n) internal pure returns (string memory) {
        if (n < 10) return string.concat("0", n.toString());
        return n.toString();
    }

    /// @dev Zero-pad a number to 4 digits ("0001", "0123").
    function _pad4(uint256 n) internal pure returns (string memory) {
        string memory s = n.toString();
        uint256 len = bytes(s).length;
        if (len >= 4) return s;
        bytes memory out = new bytes(4);
        for (uint256 i = 0; i < 4 - len; i++) out[i] = "0";
        for (uint256 i = 0; i < len; i++) out[4 - len + i] = bytes(s)[i];
        return string(out);
    }
}
