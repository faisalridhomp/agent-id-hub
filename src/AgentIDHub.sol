// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";
import {StreakBadge} from "./StreakBadge.sol";

/// @title AgentID Hub — daily check-in streaks, tip-by-name, and leaderboards
///        for Binance Agent ID holders on BNB Chain.
/// @notice Built for the Binance Agent ID Hackathon (submission 2026-11-18 →
///         2026-12-09). Every feature is gated by / built on the Agent ID
///         contract 0x60b9262456de011f7d15a54cdd8c48baaa8b022f (SPACE ID Agent
///         ID, soulbound ERC-721):
///         - checkIn(): only addresses with balanceOf > 0 (Agent ID holders).
///         - tipByName(): resolves a bare handle ("jackdefi") to its holder
///           via ownerOfHandle() and forwards 100% of msg.value. Zero fee.
///         - Leaderboards are computed off-chain from the events below
///           (addresses + scores on-chain, names via handleOf() view calls).
///
///         Owner powers (disclosed): ONLY pause/unpause. The owner cannot
///         move funds, cannot change the Agent ID address, cannot mint
///         badges, and cannot upgrade anything. Ownership is deliberately
///         NOT OpenZeppelin Ownable: there is no transferOwnership and no
///         renounceOwnership, so the owner can never brick the hub by
///         pausing and then renouncing (Copilot review 2026-11-18).
///         There is no proxy, no token,
///         no fee, and no yield/returns promise of any kind. Tips are explicit
///         user-initiated payments: the tipper signs the exact transaction in
///         their own wallet; nothing is ever taken without confirmation.
contract AgentIDHub is Pausable, ReentrancyGuard {
    /// @notice The deployer. Can only pause/unpause. Cannot be transferred
    ///         or renounced — the deployer stays the owner forever.
    address public immutable owner;
    /// @notice The Agent ID contract (immutable).
    IAgentID public immutable agentId;
    /// @notice The soulbound streak-badge contract (immutable).
    StreakBadge public immutable badge;

    /// @notice One UTC day in seconds. Streaks reset at 00:00 UTC.
    uint256 public constant DAY = 86400;

    struct UserStats {
        uint32 lastCheckInDay; // UTC day number of the last check-in
        uint32 currentStreak; // consecutive days incl. today
        uint32 bestStreak; // longest streak ever
        uint32 totalCheckIns; // lifetime check-ins
    }

    /// @notice Per-address streak state. Packed into one storage slot.
    mapping(address => UserStats) public users;

    /// @notice Total BNB a holder has received in tips.
    mapping(address => uint256) public totalTippedReceived;
    /// @notice Total BNB an address has sent in tips.
    mapping(address => uint256) public totalTippedSent;
    /// @notice Number of distinct addresses that have ever tipped `user`.
    ///         Leaderboards rank by this first, so self-tipping cannot inflate
    ///         a rank (self-tips are rejected outright; a Sybil with N
    ///         addresses can still add N tippers — inherent to any
    ///         address-based ranking, disclosed in the README).
    mapping(address => uint256) public uniqueTipperCount;
    /// @notice hasTipped[recipient][tipper] — true once `tipper` has tipped
    ///         `recipient` at least once. (First index is the recipient.)
    mapping(address => mapping(address => bool)) public hasTipped;

    event CheckIn(address indexed user, string handle, uint32 streak, uint32 day);
    event Tip(address indexed from, string handle, address indexed to, uint256 amount);
    event BadgeMinted(address indexed user, uint32 milestone);

    error NoAgentId();
    error AlreadyCheckedInToday();
    error UnknownHandle();
    error ZeroTip();
    error SelfTip();
    error TipTransferFailed();
    error ZeroAgentId();

    constructor(address agentId_) {
        if (agentId_ == address(0)) revert ZeroAgentId();
        owner = msg.sender;
        agentId = IAgentID(agentId_);
        // The hub deploys its own badge so there is no circular
        // constructor dependency (badge needs the hub, hub needs the badge).
        badge = new StreakBadge(address(this), address(agentId));
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentIDHub: not owner");
        _;
    }

    /// @notice Check in once per UTC day. Only Agent ID holders.
    ///         Consecutive days grow the streak; a missed day resets it to 1.
    ///         Hitting a 7 / 30 / 100-day streak mints a soulbound badge.
    ///         Deliberately NOT pausable: a pause spanning 00:00 UTC would
    ///         break every live streak (Superbot review 2026-11-18), and
    ///         check-ins move no funds, so there is nothing for a pause to
    ///         protect. Only the money path (tips) can be paused.
    function checkIn() external nonReentrant {
        if (agentId.balanceOf(msg.sender) == 0) revert NoAgentId();
        // Day numbers start at 1 (not 0): lastCheckInDay == 0 means "never
        // checked in", so a first check-in can never collide with it.
        uint32 day = uint32(block.timestamp / DAY) + 1;
        UserStats storage s = users[msg.sender];
        if (s.lastCheckInDay == day) revert AlreadyCheckedInToday();

        uint32 streak = (s.lastCheckInDay == day - 1) ? s.currentStreak + 1 : 1;
        s.lastCheckInDay = day;
        s.currentStreak = streak;
        if (streak > s.bestStreak) s.bestStreak = streak;
        s.totalCheckIns += 1;

        string memory handle = agentId.handleOf(msg.sender);
        emit CheckIn(msg.sender, handle, streak, day);

        if (streak == 7 || streak == 30 || streak == 100 || streak == 1000) {
            // mintBadge is a no-op (returns false) if the badge already exists,
            // so a repeated milestone across broken streaks never reverts.
            if (badge.mintBadge(msg.sender, streak)) {
                emit BadgeMinted(msg.sender, streak);
            }
        }
    }

    /// @notice Tip an Agent ID holder by bare handle, e.g. "jackdefi"
    ///         (the frontend strips a trailing ".ai" and lowercases input).
    ///         Forwards 100% of msg.value to the handle's holder. No fee.
    ///         Reverts if the handle is unknown (ownerOfHandle returns 0)
    ///         or if the recipient cannot receive BNB — in both cases no
    ///         funds move and no state changes.
    function tipByName(string calldata handle) external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroTip();
        address recipient = agentId.ownerOfHandle(handle);
        if (recipient == address(0)) revert UnknownHandle();
        if (recipient == msg.sender) revert SelfTip();

        // Effects first (checks-effects-interactions), then the single call.
        totalTippedSent[msg.sender] += msg.value;
        totalTippedReceived[recipient] += msg.value;
        if (!hasTipped[recipient][msg.sender]) {
            hasTipped[recipient][msg.sender] = true;
            uniqueTipperCount[recipient] += 1;
        }
        emit Tip(msg.sender, handle, recipient, msg.value);

        (bool ok, ) = recipient.call{value: msg.value}("");
        if (!ok) revert TipTransferFailed();
    }

    /// @notice Streak state for an address (for the frontend).
    function getUser(address user) external view returns (UserStats memory) {
        return users[user];
    }

    /// @notice The streak that is still alive right now: 0 if the user has
    ///         already missed a day (last check-in was before yesterday),
    ///         else the stored current streak. `getUser` alone returns the
    ///         stale stored value after a missed day; leaderboards must use
    ///         this view (Superbot review 2026-11-18).
    function effectiveStreak(address user) external view returns (uint32) {
        UserStats storage s = users[user];
        uint32 today = uint32(block.timestamp / DAY) + 1;
        if (s.lastCheckInDay == 0 || s.lastCheckInDay + 1 < today) return 0;
        return s.currentStreak;
    }

    /// @notice Tipping totals for an address (for the frontend leaderboard).
    function getTipTotals(address user)
        external
        view
        returns (uint256 received, uint256 sent, uint256 uniqueTippers)
    {
        return (totalTippedReceived[user], totalTippedSent[user], uniqueTipperCount[user]);
    }

    /// @notice Emergency pause (owner only). Pauses TIPS only — check-ins
    ///         are deliberately unpausable so an admin action can never break
    ///         live streaks. Disclosed owner power: pause / unpause ONLY.
    ///         No fund movement, no address changes, no upgrades.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume after an emergency pause (owner only).
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice The contract never holds funds by design (tips forward in the
    ///         same call), but reject accidental plain BNB transfers so no
    ///         value can ever get stuck here.
    receive() external payable {
        revert("AgentIDHub: use tipByName");
    }
}
