# Cloudflare Pages — AgentID Hub (PRIMARY hosting, per Faisal 2026-11-18)

Faisal's decision: pages.dev is the MAIN site for promotion, not a backup.
Target URL: https://agentidhub.pages.dev
GitHub Pages (faisalridhomp.github.io/agent-id-hub/) stays live as backup until Pages is verified.

## Status — LIVE 2026-11-18 ~22:2x WIB
- Cloudflare account: created by Faisal via GitHub SSO (faisalridhomp / faisalridhomp@gmail.com). Account id `1af2bde693e9bd1b5582c56aad26888a`.
- Dashboard sign-in via Muse cloud browser: BLOCKED by Turnstile (2026-11-18) — do not retry.
- API token route: first paste was the Global API Key (My Profile → API Keys) → 401, because it authenticates via X-Auth-Email/X-Auth-Key, not Bearer. Correct credential = **API Token** (My Profile → API Tokens, "Edit Cloudflare Workers" template), secret shown once at creation. Faisal re-pasted the right token ~22:16 WIB → `verify` returns "This API Token is valid and active".
- Connector: `custom.cloudflare` (helper `~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py` — verify/accounts/projects/create-project/deployments). Wrangler 4.164.0 installed at `~/workspace/cloudflare-wrangler/` (npm, --ignore-scripts). Wrangler works with the token via the `hsurr:` surrogate: `CLOUDFLARE_API_TOKEN=$(python3 -c "...dynamic_credential_entry('custom.cloudflare')['surrogate']...") wrangler ...` — the egress proxy swaps the surrogate for the real token on api.cloudflare.com. Never print the surrogate or the token.
- Project `agentidhub` already existed (created before the deploy step, source = direct upload). Deploy: `wrangler pages deploy docs --project-name agentidhub --commit-dirty=true` → 9 files, deployment 33c7356d, production, success. Verified live via browser.open: hero + Mecha Mythic image + Hub Pass + Mecha tier table all render at https://agentidhub.pages.dev/
- README.md + SUBMISSION.md website URL updated to pages.dev (commit c8245f4, pushed).
- NOTE: direct upload has NO git auto-deploy — after every frontend push, re-run the wrangler deploy command above. (GitHub-connected Option A would auto-deploy but needs dashboard access from Faisal's own device to connect the repo.)

## Blocker (resolved)

## Setup (once account exists)
Option A — GitHub-connected (preferred, auto-deploy on push):
1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. Repo: faisalridhomp/agent-id-hub, branch main
3. Framework preset: None. Build command: (empty). Build output directory: docs
4. Project name: agentidhub → URL https://agentidhub.pages.dev
5. Deploy. Verify hero + Mecha section render, then update SUBMISSION.md
   website URL to the pages.dev link.

Option B — direct upload via Wrangler (needs API token from Faisal):
- Token: dash.cloudflare.com → Profile → API Tokens → "Edit Cloudflare
  Workers" template (covers Pages). Paste via Secure Vault link.
- `npx wrangler pages deploy docs --project-name agentidhub`
- NOTE: direct uploads do NOT auto-deploy on git push; re-upload after changes.

## After Pages is live
- Update SUBMISSION.md website URL → https://agentidhub.pages.dev
- Update README.md demo link.
- Keep GitHub Pages enabled as fallback; do NOT delete docs/ from repo.
