// Generate docs/data/logs.json — a static snapshot of all Hub event logs.
// Uses Faisal's NodeReal key (the ONLY endpoint that serves eth_getLogs).
// The key is read from ~/.nodereal/credentials and NEVER printed or written
// into the output file. Run: node gen-logs-snapshot.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("/home/hatch/workspace/ethers.js");

const HUB = "0x14D5D6b97b7c3d22c49FC6De7667374692de5462";
const PASS = "0x3Ae82E031702166B0cCFBFbf037f364998DB0688";
const MECHA = "0x59E3aaF9e0392aAdCE143793372F19D6cCf21e01";
const HUB_DEPLOY_BLOCK = 134337199;
const PAGE = 5000;

const HUB_ABI = [
  "event CheckIn(address indexed user, string handle, uint32 streak, uint32 day)",
  "event Tip(address indexed from, string handle, address indexed to, uint256 amount)",
];
const TRANSFER_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

function nodeRealUrl() {
  const raw = fs.readFileSync(process.env.HOME + "/.nodereal/credentials", "utf8").trim();
  let key = raw;
  try { const j = JSON.parse(raw); key = j.key || j.apiKey || j.apikey || raw; } catch { /* plain text */ }
  return "https://bsc-mainnet.nodereal.io/v1/" + key;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPaged(contract, filter, from, to, label) {
  const events = [];
  let coveredTo = from - 1;
  for (let f = from; f <= to; f += PAGE) {
    const t = Math.min(to, f + PAGE - 1);
    let logs = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        logs = await contract.queryFilter(filter, f, t);
        break;
      } catch (e) {
        const msg = (e && e.message) || "";
        console.error(`  ${label} [${f}-${t}] attempt ${attempt + 1} failed: ${String(msg).slice(0, 120)}`);
        await sleep(1000 * (attempt + 1));
      }
    }
    if (logs === null) {
      console.error(`  ${label} [${f}-${t}] GIVING UP — snapshot will stop at ${coveredTo}`);
      break;
    }
    for (const l of logs) {
      events.push({ b: l.blockNumber, i: l.index, topics: [...l.topics], data: l.data });
    }
    coveredTo = t;
    if ((f - from) % 50000 === 0) console.log(`  ${label}: up to block ${t} (${events.length} events)`);
    await sleep(120);
  }
  events.sort((a, b) => a.b - b.b || a.i - b.i);
  return { coveredTo, events };
}

(async () => {
  const provider = new ethers.JsonRpcProvider(nodeRealUrl());
  const current = await provider.getBlockNumber();
  console.log("current block:", current, "| range:", HUB_DEPLOY_BLOCK, "->", current);
  const hub = new ethers.Contract(HUB, HUB_ABI, provider);
  const pass = new ethers.Contract(PASS, TRANSFER_ABI, provider);
  const mecha = new ethers.Contract(MECHA, TRANSFER_ABI, provider);

  const out = {
    generatedAt: new Date().toISOString(),
    coveredTo: current,
    chainId: 56,
    logs: {},
  };
  out.logs[HUB + ":CheckIn"] = await fetchPaged(hub, hub.filters.CheckIn, HUB_DEPLOY_BLOCK, current, "CheckIn");
  out.logs[HUB + ":Tip"] = await fetchPaged(hub, hub.filters.Tip, HUB_DEPLOY_BLOCK, current, "Tip");
  out.logs[PASS + ":Transfer"] = await fetchPaged(pass, pass.filters.Transfer, HUB_DEPLOY_BLOCK, current, "PassTransfer");
  out.logs[MECHA + ":Transfer"] = await fetchPaged(mecha, mecha.filters.Transfer, HUB_DEPLOY_BLOCK, current, "MechaTransfer");

  const dir = path.join(__dirname, "docs", "data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "logs.json");
  fs.writeFileSync(file, JSON.stringify(out));
  const counts = Object.entries(out.logs).map(([k, v]) => `${k.split(":")[1]}=${v.events.length} (to ${v.coveredTo})`).join(", ");
  console.log("WROTE", file, `${(fs.statSync(file).size / 1024).toFixed(1)} KB`, "|", counts);
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
