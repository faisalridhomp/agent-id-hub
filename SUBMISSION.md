# Binance Agent ID Hackathon — Submission Draft (DO NOT SUBMIT without Faisal's word)

## Project name
**AgentID Hub**

## Website
https://agentidhub.pages.dev/ (Cloudflare Pages, primary — GitHub Pages backup: https://faisalridhomp.github.io/agent-id-hub/)

## Repository (open source)
https://github.com/faisalridhomp/agent-id-hub

## Contract addresses (BNB Chain mainnet)
- AgentIDHub: *TBD — deploy after 0.01 BNB top-up*
- StreakBadge: *TBD — deployed by the hub in the same transaction*
- Both contracts source-verified on BscScan after deploy.

## Agent ID usage description (for the submission form)
AgentID Hub is built entirely on Binance Agent ID. The official Agent ID
contract (0x60B9262456dE011F7d15a54cdd8c48baaa8b022f) is the identity layer
for every feature:

1. **Daily check-in streaks** — the hub calls `balanceOf(msg.sender)` on the
   Agent ID contract; only holders can check in. One check-in per UTC day.
   Streaks are displayed by Agent ID name (via `handleOf()`), and 7 / 30 /
   100-day streaks mint a soulbound ERC-721 badge.
2. **Tip by name** — a user tips `jackdefi` instead of a 0x address. The hub
   resolves the name on-chain with `ownerOfHandle()` and forwards 100% of
   the BNB to that holder. Unknown names revert; no funds move.
3. **Leaderboards** — top streaks and top tipped, ranked by Agent ID name
   from on-chain events. Tipping ranks by unique tippers first, so
   self-tipping cannot inflate a rank.

Every interaction (check-in, tip, badge mint) requires the caller to hold an
Agent ID, so the project's on-chain metrics are 100% Agent ID-holder
activity. Check-ins are cheap (~76k gas) to encourage daily use.

## Judging criteria mapping
- **Agent ID Application Depth (30%)** — Agent ID is the gate, the
  addressing system, and the display name for all three features; the
  product cannot function without it.
- **Practicality & Feasibility (25%)** — solves two real needs for 182,000+
  Agent ID holders: a reason to transact daily, and human-readable payments.
  No token, no new trust assumptions beyond the official contract.
- **Product Completion (25%)** — live contracts + live website + 17/17
  tests passing (including 3 fork tests against the real Agent ID contract).
- **Innovation (20%)** — first hub that turns the .ai name into a daily
  habit loop (streaks + soulbound badges) and a payment address.

## Safety / red-line compliance
- No QR-code login, no session storage, no prompts that bypass user
  confirmation — every transaction is signed by the user in their own wallet.
- No unauthorized transfers: tips are explicit, user-initiated, full-amount
  forwards with zero fee; the contract never holds funds and rejects plain
  BNB transfers.
- Contracts are open source (MIT) with disclosed owner powers: pause /
  unpause only. No proxy, no upgrade, no fund movement by the owner.
- No Binance/BNB branding in the project name or domain. No seed phrases,
  private keys, API secrets, or pairing codes are ever collected.
- No returns or "passive income" promises anywhere; no trading features.
- Agent ID is used as identity + payments, not as a tool to look up other
  people's wallets by name (lookups only resolve a name the tipper typed
  to send that person money).
- No fake volume: leaderboards rank by unique tippers; wash-tipping yields
  at most one unique tipper.
