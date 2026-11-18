# AgentID Hub

**Daily check-in streaks, tip-by-name payments, and leaderboards for Binance Agent ID holders on BNB Chain.**

Built for the [Binance Agent ID Hackathon](https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf) (submission 2026-11-18 → 2026-12-09, 60,000 USDC rewards).

## What it does

| Feature | How Agent ID is used |
|---|---|
| **Daily check-in streaks** | Only addresses holding an Agent ID (`balanceOf > 0` on `0x60B9…022F`) can check in once per UTC day. Consecutive days grow the streak; a missed day resets it. |
| **Soulbound streak badges** | 7 / 30 / 100 / 1000-day streaks mint a non-transferable ERC-721 badge (same soulbound idea as Agent ID itself). Tiers: Bronze, Silver, Gold, Diamond. |
| **Tip by name** | Send BNB to `jackdefi` instead of a `0x` address. The contract resolves the name on-chain via `ownerOfHandle()` and forwards **100%** of the tip. Zero fee. |
| **Hub Pass** | Free membership pass, one per Agent ID holder. Passes #1–100 are Founding Members (soulbound); #101+ are tradable. |
| **Mecha Agent** | Free random-tier robot collectible, supply 666. One mint draw decides tier (Common 300 / Rare 200 / Epic 100 / Legendary 50 / Mythic 16) and number #0001–#0666. Founding Pass holders mint directly; everyone else needs a 7-day best streak and open phase 2. |
| **Agent-driven login** | No manual wallet connect needed: the user tells their AI agent to connect, and the agent executes check-in / mint / tip through the Binance Agentic Wallet (`baw`). The site ships a one-prompt README for AI agents (`docs/agent-prompt.txt`). No QR login, no session storage. |
| **Leaderboards** | Top streaks and top tipped, computed from on-chain events. Tipping ranks by **unique tippers first**, so self-tipping cannot buy a rank. |

## Contracts

| Contract | Address (BSC mainnet) | Notes |
|---|---|---|
| AgentIDHub | `0x14D5D6b97b7c3d22c49FC6De7667374692de5462` | v3, deployed 2026-11-18, tx `0x4b3a9db29113c7acd988cc10561e367ed4197ba42fa978a2a5a9a6121c62bcef`, verified on BscScan + Sourcify |
| StreakBadge | `0xB4C3649078556547B432a74E472e4F44F1758Fa3` | v3, deployed by the hub in the same tx; tiered art, 1000-day Diamond |
| HubPass | `0x3Ae82E031702166B0cCFBFbf037f364998DB0688` | Deployed 2026-11-18, tx `0x30657d9e64a5958ad10b3c9064eb0b329355d716ccf06000c41273a85495246d`, verified; Founding 1–100 soulbound, Member 101+ tradable |
| MechaAgent | `0x59E3aaF9e0392aAdCE143793372F19D6cCf21e01` | Deployed 2026-11-18, tx `0xe1033409baadaa38c73f08d88db81ffcc61be7a7b3b30544f389daffb5bf854e`, verified; supply 666, random tier + number |
| Agent ID (official) | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` | SPACE ID Agent ID, ERC-721, non-transferable |

Live traction (checked 2026-11-19 morning, on-chain): **109 Hub Passes** and **53 Mechas** minted by real users within ~8 hours of the mainnet launch.

## Owner powers (disclosed)

The owner can **only pause / unpause tips** (emergency brake on the money path). Check-ins are deliberately unpausable so an admin action can never break live streaks. Ownership is NOT OpenZeppelin Ownable: there is no transfer and no renounce, so the owner can never brick the hub. The owner **cannot** move funds, change the Agent ID address, mint badges, or upgrade anything. There is no proxy, no token, no fee, and no yield or returns promise. Tips are explicit user-initiated payments: the tipper signs the exact transaction in their own wallet.

## How name resolution works (verified, not guessed)

The Agent ID contract exposes `ownerOfHandle(string) → address` and `handleOf(address) → string`. Verified live on 2026-11-18 via NodeReal RPC:

- `ownerOfHandle("jackdefi")` → `0x3Bc96b2528f686F27b04897bD819bC10D8981B1b`
- `handleOf(0x3Bc9…)` → `"jackdefi"`
- `ownerOfHandle("zzzznotreal12345")` → `address(0)` (does **not** revert — the hub checks for zero and reverts with `UnknownHandle`)
- `balanceOf(0x3Bc9…)` → `1`; handle length bounds 3–20.

## Tests

```bash
forge test --match-contract AgentIDHubTest        # 14 unit tests (mock Agent ID)
forge test --match-contract AgentIDHubForkTest --fork-url <BSC RPC>  # 3 tests vs the REAL Agent ID contract
```

20/20 pass (2026-11-18): 17 unit tests (mock Agent ID) + 3 fork tests vs the real Agent ID contract. Fork tests impersonate the real `jackdefi.ai` holder via `vm.prank` — no real funds move.

Full suite now **37/37 pass** (29 pre-Mecha + 8 MechaAgent, incl. a full 666-mint run verifying exact tier caps 300/200/100/50/16 and unique numbers 1–666).

## Deploy

```bash
# BSC testnet (needs a MockAgentID — no official Agent ID on testnet):
forge script script/DeployTestnet.s.sol --rpc-url <testnet RPC> --broadcast --private-key $KEY
# BSC mainnet:
AGENT_ID=0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F forge script script/Deploy.s.sol --rpc-url <mainnet RPC> --broadcast --private-key $KEY
```

Then update `docs/config.js` with the deployed addresses and verify both contracts on BscScan (`forge verify-contract`).

## Frontend

Static site in `docs/` (no build step, no backend): `index.html` + `app.js` + `config.js` + `styles.css`. Primary URL (Cloudflare Pages): https://agentidhub.pages.dev/ — GitHub Pages backup: https://faisalridhomp.github.io/agent-id-hub/

The site also ships a one-prompt README for AI agents (`docs/agent-prompt.txt`, with a copy button on the page): an agent reads the site, then executes check-in / mint / tip through the user's Binance Agentic Wallet — one copy-paste, all tasks done.

## Security notes

- Tips use checks-effects-interactions + `nonReentrant`; a recipient that rejects BNB makes the whole tip revert atomically — no funds ever stick in the hub (the hub also rejects plain BNB transfers).
- Streak day numbers start at 1 so the uninitialized `lastCheckInDay == 0` can never collide with a real check-in day (found by unit tests, fixed before deploy).
- Badge minting is idempotent: hitting the same milestone twice across broken streaks is a no-op, never a revert.
- Badges use plain `_mint`, not `_safeMint`: a contract-wallet holder without an ERC-721 receiver hook could otherwise be locked out of milestone check-ins (Groq review).
- Self-tips are rejected; `effectiveStreak()` returns the live streak (0 after a missed day) so leaderboards never rank on stale stored values (Superbot review).
- Non-canonical handles are safe: `ownerOfHandle("JACKDEFI")` and `ownerOfHandle("jackdefi.ai")` both return `address(0)` on the real contract (verified live), so the hub reverts with `UnknownHandle` and no funds move. The frontend lowercases and strips `.ai` before calling.
- No approvals are ever requested. No QR login. No data leaves the user's wallet except the transactions they sign.

## License

MIT.
