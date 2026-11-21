#!/bin/bash
# Refresh the AgentID Hub logs snapshot and redeploy.
# Regenerates docs/data/logs.json from NodeReal (the only endpoint that
# serves eth_getLogs), commits + pushes when it changed, and redeploys
# Cloudflare Pages. Used by the hub-logs-snapshot cron (every 6h).
# Safe to run manually. Never prints the NodeReal key.
set -e
cd "$(dirname "$0")"
node gen-logs-snapshot.js
git add -f docs/data/logs.json
if git diff --cached --quiet; then
  echo "snapshot unchanged — nothing to commit or deploy"
  exit 0
fi
git commit -m "Update logs snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin main
~/workspace/cloudflare-venv/bin/python ~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py deploy 1af2bde693e9bd1b5582c56aad26888a agentidhub docs --branch main
echo "snapshot refreshed + deployed"
