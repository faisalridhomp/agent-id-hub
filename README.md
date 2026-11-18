# AgentID Hub

**Daily check-in streaks, tip-by-name payments, and leaderboards for Binance Agent ID holders on BNB Chain.**

Built for the [Binance Agent ID Hackathon](https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf) (submission 2026-11-18 → 2026-12-09, 60,000 USDC rewards).

## What it does

| Feature | How Agent ID is used |
|---|---|
| **Daily check-in streaks** | Only addresses holding an Agent ID (`balanceOf > 0` on `0x60B9…022F`) can check in once per UTC day. Consecutive days grow the streak; a missed day resets it. |
| **Soulbound streak badges** | 7 / 30 / 100-day streaks mint a non-transferable ERC-721 badge (same soulbound idea as Agent ID itself). |
| **Tip by name** | Send BNB to `jackdefi` instead of a `0x` address. The contract resolves the name on-chain via `ownerOfHandle()` and forwards **100%** of the tip. Zero fee. |
| **Leaderboards** | Top streaks and top tipped, computed from on-chain events. Tipping ranks by **unique tippers first**, so self-tipping cannot buy a rank. |

## Contracts

| Contract | Address (BSC mainnet) | Notes |
|---|---|---|
| AgentIDHub | *TBD — deploy pending funding* | Deploys its own StreakBadge in the constructor |
| StreakBadge | *TBD — deployed by the hub* | Soulbound ERC-721, on-chain metadata |
| Agent ID (official) | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` | SPACE ID Agent ID, ERC-721, non-transferable |

Deploy gas (measured, anvil dry run): **3,451,808 gas** for both contracts.
At the live mainnet gas price of 0.05 gwei (2026-11-18) that is **≈0.00017 BNB**; at a conservative 1 gwei it is **≈0.0035 BNB**. Budget **0.01 BNB** for deploy + post-deploy smoke tests.

## Owner powers (disclosed)

The owner can **only pause / unpause** check-ins and tips (emergency brake). The owner **cannot** move funds, change the Agent ID address, mint badges, or upgrade anything. There is no proxy, no token, no fee, and no yield or returns promise. Tips are explicit user-initiated payments: the tipper signs the exact transaction in their own wallet.

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

17/17 pass (2026-11-18). Fork tests impersonate the real `jackdefi.ai` holder via `vm.prank` — no real funds move.

## Deploy

```bash
# BSC testnet (needs a MockAgentID — no official Agent ID on testnet):
forge script script/DeployTestnet.s.sol --rpc-url <testnet RPC> --broadcast --private-key $KEY
# BSC mainnet:
AGENT_ID=0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F forge script script/Deploy.s.sol --rpc-url <mainnet RPC> --broadcast --private-key $KEY
```

Then update `frontend/config.js` with the deployed addresses and verify both contracts on BscScan (`forge verify-contract`).

## Frontend

Static site in `frontend/` (no build step, no backend): `index.html` + `app.js` + `config.js` + `styles.css`. Served on GitHub Pages: https://faisalridhomp.github.io/agent-id-hub/

## Security notes

- Tips use checks-effects-interactions + `nonReentrant`; a recipient that rejects BNB makes the whole tip revert atomically — no funds ever stick in the hub (the hub also rejects plain BNB transfers).
- Streak day numbers start at 1 so the uninitialized `lastCheckInDay == 0` can never collide with a real check-in day (found by unit tests, fixed before deploy).
- Badge minting is idempotent: hitting the same milestone twice across broken streaks is a no-op, never a revert.
- No approvals are ever requested. No QR login. No data leaves the user's wallet except the transactions they sign.

## License

MIT.
