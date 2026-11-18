# Binance Agent ID Hackathon — Submission Draft (DO NOT SUBMIT without Faisal's word)

## Project name
**AgentID Hub**

## Website
https://agentidhub.pages.dev/ (Cloudflare Pages, primary — GitHub Pages backup: https://faisalridhomp.github.io/agent-id-hub/)

## Repository (open source)
https://github.com/faisalridhomp/agent-id-hub

## Contract addresses (BNB Chain mainnet — v3, LIVE 2026-11-18 ~22:40 WIB)
- AgentIDHub: `0x14D5D6b97b7c3d22c49FC6De7667374692de5462` (tx `0x4b3a9db29113c7acd988cc10561e367ed4197ba42fa978a2a5a9a6121c62bcef`, block 134337199)
- StreakBadge: `0xB4C3649078556547B432a74E472e4F44F1758Fa3` (deployed by the hub in the same transaction; tiered art, 1000-day Diamond)
- HubPass: `0x3Ae82E031702166B0cCFBFbf037f364998DB0688` (tx `0x30657d9e64a5958ad10b3c9064eb0b329355d716ccf06000c41273a85495246d`; Founding 1–100 soulbound, Member 101+ tradable)
- MechaAgent: `0x59E3aaF9e0392aAdCE143793372F19D6cCf21e01` (tx `0xe1033409baadaa38c73f08d88db81ffcc61be7a7b3b30544f389daffb5bf854e`; supply 666, random tier + number)
- All four contracts source-verified on BscScan + Sourcify; wiring verified on-chain.

Live traction (checked 2026-11-19 morning, on-chain): **109 Hub Passes** and **53 Mechas** minted by real users within ~8 hours of launch.

## Agent ID usage description (for the submission form)
AgentID Hub is built entirely on Binance Agent ID. The official Agent ID
contract (0x60B9262456dE011F7d15a54cdd8c48baaa8b022f) is the identity layer
for every feature:

1. **Daily check-in streaks** — the hub calls `balanceOf(msg.sender)` on the
   Agent ID contract; only holders can check in. One check-in per UTC day.
   Streaks are displayed by Agent ID name (via `handleOf()`), and 7 / 30 /
   100 / 1000-day streaks mint a soulbound ERC-721 badge (Bronze, Silver,
   Gold, Diamond).
2. **Tip by name** — a user tips `jackdefi` instead of a 0x address. The hub
   resolves the name on-chain with `ownerOfHandle()` and forwards 100% of
   the BNB to that holder. Unknown names revert; no funds move.
3. **Leaderboards** — top streaks and top tipped, ranked by Agent ID name
   from on-chain events. Tipping ranks by unique tippers first, so
   self-tipping cannot inflate a rank.
4. **Hub Pass** — a free membership pass, one per Agent ID holder. Passes
   #1–100 are Founding Members (soulbound proof of being early); #101+ are
   tradable. The pass always shows its current holder's handle.
5. **Mecha Agent** — a free random-tier robot collectible (supply 666).
   Founding Pass holders mint directly; everyone else needs a 7-day best
   streak and open phase 2. One mint draw decides tier (Common 300 / Rare
   200 / Epic 100 / Legendary 50 / Mythic 16) and number #0001–#0666.
6. **Agent-driven login** — the user never connects a wallet manually in a
   browser. They tell their AI agent to connect, and the agent executes
   check-in / mint / tip through the Binance Agentic Wallet. The site ships
   a one-prompt README for AI agents, so one copy-paste does every task.
   No QR-code login, no session storage — every transaction is confirmed
   by the user in their Binance App.

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
- **Product Completion (25%)** — live contracts + live website + 37/37
  tests passing (including a full 666-mint run and 3 fork tests against the
  real Agent ID contract). Live traction within ~8 hours of launch:
  109 Hub Passes and 53 Mechas minted by real users.
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
