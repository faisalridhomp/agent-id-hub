// AgentID Hub frontend — ethers v6, no build step, no backend.
// All reads go to public BSC RPC; all writes are signed by the user in their own wallet.
const HUB_ABI = [
  "function checkIn()",
  "function tipByName(string handle) payable",
  "function getUser(address) view returns (uint32 lastCheckInDay, uint32 currentStreak, uint32 bestStreak, uint32 totalCheckIns)",
  "function getTipTotals(address) view returns (uint256 received, uint256 sent, uint256 uniqueTippers)",
  "function users(address) view returns (uint32,uint32,uint32,uint32)",
  "function agentId() view returns (address)",
  "function badge() view returns (address)",
  "event CheckIn(address indexed user, string handle, uint32 streak, uint32 day)",
  "event Tip(address indexed from, string handle, address indexed to, uint256 amount)",
];
const PASS_ABI = [
  "function mint() returns (uint256)",
  "function hasPass(address) view returns (bool)",
  "function passOf(address) view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];
const AGENT_ID_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function handleOf(address) view returns (string)",
  "function ownerOfHandle(string) view returns (address)",
  "function isValidHandle(string) view returns (bool)",
];
const MECHA_ABI = [
  "function mint() returns (uint256 tokenId, uint256 tier)",
  "function hasMinted(address) view returns (bool)",
  "function totalMinted() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function tierOf(uint256) view returns (uint256)",
  "function tierName(uint256) view returns (string)",
  "function phase2Open() view returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

let provider, signer, userAddr, net, hub, agentId, pass, mecha;
// Hub deploy block (mainnet v3, tx 0x4b3a9d…): leaderboards scan events
// from here, so early check-ins/tips never fall out of the window.
const HUB_DEPLOY_BLOCK = 134337199;
let deployBlock = HUB_DEPLOY_BLOCK;

const $ = (id) => document.getElementById(id);
const short = (a) => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
// L-11: format from bigint, never through Number — dust amounts (< 0.0001 BNB)
// used to render as "0.0000" and big totals lost precision past 2^53 wei.
const fmtBnb = (w) => {
  const v = typeof w === "bigint" ? w : BigInt(w);
  if (v === 0n) return "0";
  if (v < 10n ** 14n) return "<0.0001";
  const s = ethers.formatEther(v);
  const [int, dec = ""] = s.split(".");
  const d4 = dec.slice(0, 4).replace(/0+$/, "");
  return d4 ? int + "." + d4 : int;
};

function normHandle(raw) {
  let h = (raw || "").trim().toLowerCase();
  if (h.endsWith(".ai")) h = h.slice(0, -3);
  return h;
}

async function connect() {
  if (!window.ethereum) {
    $("loginCard").classList.remove("hidden");
    $("loginCard").scrollIntoView({ behavior: "smooth", block: "center" });
    alert("No wallet detected in this browser. Open this site from inside the Binance App (built-in browser) or the MetaMask app, then tap Connect Wallet.");
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const netInfo = await provider.getNetwork();
    net = Number(netInfo.chainId) === 97 ? CONFIG.testnet : CONFIG.mainnet;
    // Testnet hub deployed 2026-11-18 (recent); mainnet uses the real
    // deploy block. Logs are scanned forward from deployBlock in pages
    // (see fetchLogsPaged) — no 200k-block window anymore.
    deployBlock = net.chainId === 56 ? HUB_DEPLOY_BLOCK : 0;
    if (Number(netInfo.chainId) !== net.chainId) {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: net.chainHex }] });
    }
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddr = await signer.getAddress();
    $("connectBtn").textContent = short(userAddr);
    $("loginCard").classList.add("hidden");
    $("netBadge").textContent = net.chainId === 56 ? "BNB Chain Mainnet" : "BSC Testnet";
    const hubAddr = net.hub;
    if (!hubAddr) {
      $("youCard").classList.add("hidden");
      $("noIdCard").classList.remove("hidden");
      $("noIdCard").querySelector("p").textContent =
        "AgentID Hub is not deployed on this network yet. Follow the project for the mainnet launch.";
      loadBoards();
      return;
    }
    hub = new ethers.Contract(hubAddr, HUB_ABI, signer);
    agentId = new ethers.Contract(
      net.chainId === 56 ? CONFIG.agentIdMainnet : await hub.agentId(), AGENT_ID_ABI, provider);
    $("hubLink").href = net.explorer + "/address/" + hubAddr;
    $("badgeLink").href = net.explorer + "/address/" + (net.badge || (await hub.badge()));
    if (net.pass) {
      pass = new ethers.Contract(net.pass, PASS_ABI, signer);
      $("passLink").href = net.explorer + "/address/" + net.pass;
      $("passLink2").href = net.explorer + "/address/" + net.pass;
    }
    if (net.mecha) {
      mecha = new ethers.Contract(net.mecha, MECHA_ABI, signer);
      $("mechaLink").href = net.explorer + "/address/" + net.mecha;
      $("mechaLink2").href = net.explorer + "/address/" + net.mecha;
    }
    await loadYou();
    await loadPass();
    await loadMecha();
    await loadBoards();
  } catch (e) {
    console.error(e);
    alert("Could not connect: " + (e?.info?.error?.message || e.message || e));
  }
}

async function loadYou() {
  $("youAddr").textContent = short(userAddr);
  const bal = await agentId.balanceOf(userAddr);
  if (bal === 0n) {
    $("youCard").classList.add("hidden");
    $("noIdCard").classList.remove("hidden");
    return;
  }
  $("noIdCard").classList.add("hidden");
  $("youCard").classList.remove("hidden");
  const handle = await agentId.handleOf(userAddr);
  $("youHandle").textContent = handle + ".ai";
  const s = await hub.getUser(userAddr);
  $("youStreak").textContent = s.currentStreak;
  $("youBest").textContent = s.bestStreak;
  $("youTotal").textContent = s.totalCheckIns;
  const t = await hub.getTipTotals(userAddr);
  $("youReceived").textContent = fmtBnb(t.received) + " BNB";
  $("youTippers").textContent = t.uniqueTippers;
}

async function loadPass() {
  const card = $("passCard");
  if (!$("noIdCard").classList.contains("hidden")) {
    // No Agent ID held — the pass requires one, same as check-ins.
    card.classList.add("hidden");
    return;
  }
  if (!pass) {
    // Pass not deployed on this network yet — show the card in "soon" state.
    card.classList.remove("hidden");
    $("passTotal").textContent = "—";
    $("passStatus").textContent = "Deploying soon";
    $("mintPassBtn").disabled = true;
    $("mintPassBtn").textContent = "Hub Pass — coming soon";
    return;
  }
  card.classList.remove("hidden");
  try { $("passTotal").textContent = String(await callWithFallback((p) => pass.connect(p).totalMinted())); } catch { $("passTotal").textContent = "—"; }
  const has = await pass.hasPass(userAddr);
  if (has) {
    const id = await pass.passOf(userAddr);
    $("passStatus").textContent = "You own pass #" + String(id).padStart(4, "0");
    $("mintPassBtn").classList.add("hidden");
  } else {
    $("passStatus").textContent = "Not minted yet";
    $("mintPassBtn").classList.remove("hidden");
    $("mintPassBtn").disabled = false;
    $("mintPassBtn").textContent = "Mint your free pass";
  }
}

async function loadMecha() {
  const card = $("mechaCard");
  if (!$("noIdCard").classList.contains("hidden")) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  if (!mecha) {
    $("mechaTotal").textContent = "—";
    $("mechaStatus").textContent = "Deploying soon";
    $("mintMechaBtn").disabled = true;
    $("mintMechaBtn").textContent = "Mecha Agent — coming soon";
    return;
  }
  try { $("mechaTotal").textContent = String(await callWithFallback((p) => mecha.connect(p).totalMinted())) + " / 666"; } catch { $("mechaTotal").textContent = "—"; }
  if (await mecha.hasMinted(userAddr)) {
    $("mechaStatus").textContent = "Minted ✓ (1 per wallet)";
    $("mintMechaBtn").classList.add("hidden");
    return;
  }
  // Eligibility hint (the contract is the final judge and reverts clearly).
  let hint = "Not minted yet";
  try {
    if (pass) {
      const pid = await pass.passOf(userAddr);
      if (pid >= 1n && pid <= 100n) hint = "Founding — you can mint now, no streak needed";
    }
    if (hint === "Not minted yet") {
      const s = await hub.getUser(userAddr);
      const totalMinted = await mecha.totalMinted();
      const p2 = await mecha.phase2Open();
      if (Number(s.bestStreak) >= 7 && p2) hint = "Eligible — 7-day streak ✓";
      else if (Number(s.bestStreak) >= 7) hint = "Phase 2 not open yet — opens at 100 Mecha mints (" + String(totalMinted) + "/100) or Nov 25";
      else hint = "Needs a 7-day best streak (or a Founding Pass)";
    }
  } catch { /* hint is best-effort */ }
  $("mechaStatus").textContent = hint;
  $("mintMechaBtn").classList.remove("hidden");
  $("mintMechaBtn").disabled = false;
  $("mintMechaBtn").textContent = "Mint your free Mecha";
}

async function doMintMecha() {
  if (!signer) { await connect(); return; }
  if (!mecha) return;
  $("mechaMsg").textContent = "Confirm the mint in your wallet — free, gas only. Your tier and number are drawn at random…";
  try {
    const tx = await mecha.mint();
    $("mechaMsg").textContent = "Mint sent: " + tx.hash + " — waiting for confirmation…";
    const rc = await tx.wait();
    let detail = "";
    try {
      const log = rc.logs.find((l) => {
        try { return mecha.interface.parseLog(l)?.name === "Transfer"; } catch { return false; }
      });
      const tokenId = Number(mecha.interface.parseLog(log).args.tokenId);
      const tier = await mecha.tierName(await mecha.tierOf(tokenId));
      detail = " You drew Mecha #" + String(tokenId).padStart(4, "0") + " — " + tier + " tier!";
    } catch { /* detail is best-effort */ }
    $("mechaMsg").textContent = "✓ Mecha minted!" + detail;
    await loadMecha();
  } catch (e) {
    $("mechaMsg").textContent = "Mint failed: " + (e?.info?.error?.message || e?.reason || e.message || e);
  }
}

async function doMintPass() {
  if (!signer) { await connect(); return; }
  if (!pass) return;
  $("passMsg").textContent = "Confirm the mint in your wallet — free, gas only…";
  try {
    const tx = await pass.mint();
    $("passMsg").textContent = "Mint sent: " + tx.hash + " — waiting for confirmation…";
    await tx.wait();
    $("passMsg").textContent = "✓ Pass minted! Welcome to the hub.";
    await loadPass();
  } catch (e) {
    $("passMsg").textContent = "Mint failed: " + (e?.info?.error?.message || e?.reason || e.message || e);
  }
}

async function doCheckIn() {
  if (!signer) { await connect(); return; }
  $("checkinMsg").textContent = "Confirm the check-in in your wallet…";
  try {
    const tx = await hub.checkIn();
    $("checkinMsg").textContent = "Check-in sent: " + tx.hash + " — waiting for confirmation…";
    await tx.wait();
    $("checkinMsg").textContent = "✓ Checked in! Streak updated.";
    await loadYou(); await loadBoards();
  } catch (e) {
    $("checkinMsg").textContent = "Check-in failed: " + (e?.info?.error?.message || e?.reason || e.message || e);
  }
}

async function resolveTip() {
  const h = normHandle($("tipHandle").value);
  if (!h || !hub) { $("tipResolve").textContent = "—"; return; }
  try {
    const addr = await agentId.ownerOfHandle(h);
    $("tipResolve").textContent = addr === ethers.ZeroAddress ? "unknown handle" : h + ".ai → " + short(addr);
  } catch { $("tipResolve").textContent = "—"; }
}

async function doTip() {
  if (!signer) { await connect(); return; }
  const h = normHandle($("tipHandle").value);
  const amt = $("tipAmount").value;
  if (!h) { $("tipMsg").textContent = "Enter a handle first."; return; }
  if (!amt || Number(amt) <= 0) { $("tipMsg").textContent = "Enter an amount above 0."; return; }
  $("tipMsg").textContent = "Confirm the tip in your wallet — the full amount goes to " + h + ".ai…";
  try {
    const tx = await hub.tipByName(h, { value: ethers.parseEther(String(amt)) });
    $("tipMsg").textContent = "Tip sent: " + tx.hash + " — waiting for confirmation…";
    await tx.wait();
    $("tipMsg").textContent = "✓ Tipped " + h + ".ai " + amt + " BNB.";
    await loadYou(); await loadBoards();
  } catch (e) {
    $("tipMsg").textContent = "Tip failed: " + (e?.info?.error?.message || e?.reason || e.message || e);
  }
}

async function loadBoards() {
  if (!hub) { setBoardEmpty(); return; }
  try {
    const current = await currentBlock();
    const [ci, tp] = await Promise.all([
      fetchLogsPaged(hub, hub.filters.CheckIn, "CheckIn", deployBlock, current),
      fetchLogsPaged(hub, hub.filters.Tip, "Tip", deployBlock, current),
    ]);
    const checkIns = ci.logs, tips = tp.logs;
    const logsOk = ci.complete && tp.complete;
    if (!checkIns.length && !tips.length && !logsOk) {
      setBoardError();
      return;
    }
    // Per-user aggregates from events alone (fallback if the getUser batch fails).
    const agg = new Map();
    for (const ev of checkIns) {
      const u = ev.args.user.toLowerCase();
      const a = agg.get(u) || { handle: ev.args.handle, best: 0, total: 0, cur: 0, day: 0 };
      a.total++;
      a.best = Math.max(a.best, Number(ev.args.streak));
      if (Number(ev.args.day) >= a.day) { a.day = Number(ev.args.day); a.cur = Number(ev.args.streak); }
      agg.set(u, a);
    }
    let states = new Map();
    try { states = await batchGetUsers([...agg.keys()]); } catch { /* event aggregates stand in */ }
    const streakRows = [...agg.entries()].map(([addr, v]) => {
      const s = states.get(addr);
      return { handle: v.handle, best: s ? s.best : v.best, cur: s ? s.cur : v.cur, total: s ? s.total : v.total };
    });
    streakRows.sort((a, b) => b.best - a.best || b.total - a.total);
    renderBoard("streakBoard", streakRows.slice(0, 20).map((r, i) =>
      `<tr><td>${i + 1}</td><td>${esc(r.handle)}.ai</td><td>${r.best}</td><td>${r.cur}</td><td>${r.total}</td></tr>`),
      "No check-ins yet — be the first.");
    // Tip board: per recipient, unique tippers + totals (bigint sort, L-11).
    const recv = new Map();
    for (const ev of tips) {
      const to = ev.args.to.toLowerCase();
      if (!recv.has(to)) recv.set(to, { handle: ev.args.handle, tippers: new Set(), total: 0n });
      const r = recv.get(to);
      r.tippers.add(ev.args.from.toLowerCase());
      r.total += ev.args.amount;
    }
    const tipRows = [...recv.values()].map((r) => ({ handle: r.handle, n: r.tippers.size, total: r.total }))
      .sort((a, b) => b.n - a.n || (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
    renderBoard("tipBoard", tipRows.slice(0, 20).map((r, i) =>
      `<tr><td>${i + 1}</td><td>${esc(r.handle)}.ai</td><td>${r.n}</td><td>${fmtBnb(r.total)}</td></tr>`),
      "No tips yet — be the first.");
  } catch (e) {
    console.error(e);
    setBoardError();
  }
}

function renderBoard(id, rows, emptyMsg) {
  const body = document.querySelector("#" + id + " tbody");
  body.innerHTML = rows.length ? rows.join("") : `<tr><td colspan="5">${emptyMsg}</td></tr>`;
}
function setBoardEmpty() {
  renderBoard("streakBoard", [], "Contract not deployed on this network yet.");
  renderBoard("tipBoard", [], "Contract not deployed on this network yet.");
}
function setBoardError() {
  // Honest RPC failure — never the false "not deployed" message (audit M-12).
  // Only overwrite while the boards still show their loading state, so a
  // refresh failure never wipes rows that already rendered.
  for (const id of ["streakBoard", "tipBoard"]) {
    const body = document.querySelector("#" + id + " tbody");
    if (body && /Loading/.test(body.textContent)) {
      body.innerHTML = `<tr><td colspan="5">Couldn't load the leaderboard — the BSC RPC is unavailable right now. Your streaks and tips are safe on-chain; try again in a bit.</td></tr>`;
    }
  }
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- Paged event-log fetching (audit M-10) ----------
// Public BSC RPCs rate-limit or reject wide eth_getLogs ranges, so logs are
// fetched in small pages from the deploy block forward, cached in
// localStorage, and only the delta is fetched on later visits. A page that
// fails on every RPC is skipped, not fatal: the UI shows what it has and
// says so honestly instead of spinning forever.
const LOG_PAGE = 10000;
const LOG_TIMEOUT_MS = 15000;
const LOG_CACHE_PREFIX = "agentidhub:logs:v1:";

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// ---------- Read RPC fallback (fix 2026-11-21) ----------
// One public RPC is never reliable enough: dataseed answered the Hub Pass
// total but flaked on the Mecha total seconds later, leaving the hero Mecha
// count as "—". Every read-only call now tries the public endpoints in
// order until one answers. The NodeReal key is deliberately NOT here — it
// must never ship in client-side code; logs come from data/logs.json.
function readProviders() {
  const list = [provider];
  if (net && net.chainId === 56) {
    for (const u of (CONFIG.mainnet.readRpcs || [])) {
      try { list.push(new ethers.JsonRpcProvider(u)); } catch { /* ignore */ }
    }
  }
  return list;
}
// Run fn(p) against each read provider in order; return the first success.
async function callWithFallback(fn, timeoutMs = 8000) {
  let lastErr;
  for (const p of readProviders()) {
    try { return await withTimeout(fn(p), timeoutMs); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all read RPCs failed");
}
// Current block via fallback (getBlockNumber on one provider alone flakes).
async function currentBlock() {
  return callWithFallback((p) => p.getBlockNumber());
}

function logCacheKey(contract, eventName) {
  return LOG_CACHE_PREFIX + (net ? net.chainId : 56) + ":" + contract.target + ":" + eventName;
}
function readLogCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.events) || typeof d.coveredTo !== "number") return null;
    return d;
  } catch { return null; }
}
function writeLogCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage full/blocked: caching is best-effort */ }
}

// Providers to try for eth_getLogs, in order. The wallet/main RPC first,
// then public fallbacks (mainnet only — testnet has no log fallbacks).
function logProviders() {
  const list = [provider];
  if (net && net.chainId === 56) {
    for (const u of (CONFIG.mainnet.logsRpcs || [])) {
      try { list.push(new ethers.JsonRpcProvider(u)); } catch { /* ignore */ }
    }
  }
  return list;
}

// Fetch all logs for one event in [fromBlock, toBlock], paged + cached.
// Returns { logs: [{args, blockNumber, index}], complete: bool }.
//
// 2026-11-21 rewrite — the old version fired ~45 pages in parallel via
// Promise.all, and boards + feed + tips each fetched the same ranges, so a
// first visit sent 100+ concurrent eth_getLogs and tripped every public
// RPC's rate limit at once (publicnode -32005 even for 100 blocks; drpc
// free-plan timeout). Three changes:
//   1. Static snapshot (data/logs.json, generated from NodeReal — the only
//      endpoint that serves eth_getLogs) seeds the cache, so a first visit
//      only fetches the small delta since the snapshot.
//   2. Concurrent callers for the same event+range share one in-flight fetch.
//   3. Pages go out 2 at a time, providers rotate per page, one retry after
//      a backoff — slow but actually completes instead of 429-ing.
const LOG_CONCURRENCY = 2;
const LOG_RETRY_DELAY_MS = 800;
const logFetchInflight = new Map();

// Static snapshot (docs/data/logs.json). Fetched once per page load; any
// failure just means "no snapshot", never a fatal error.
let snapshotPromise = null;
function loadLogSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = (typeof fetch === "function"
      ? fetch("data/logs.json").then((r) => (r.ok ? r.json() : null))
      : Promise.resolve(null)).catch(() => null);
  }
  return snapshotPromise;
}
async function seedCacheFromSnapshot(contract, eventName) {
  const snap = await loadLogSnapshot();
  if (!snap || snap.chainId !== (net ? net.chainId : 56)) return null;
  const entry = snap.logs && snap.logs[contract.target + ":" + eventName];
  if (!entry || !Array.isArray(entry.events) || typeof entry.coveredTo !== "number") return null;
  return { coveredTo: entry.coveredTo, events: entry.events };
}

async function fetchLogsPaged(contract, filter, eventName, fromBlock, toBlock) {
  const key = (net ? net.chainId : 56) + ":" + contract.target + ":" + eventName + ":" + fromBlock + "-" + toBlock;
  if (logFetchInflight.has(key)) return logFetchInflight.get(key);
  const job = fetchLogsPagedInner(contract, filter, eventName, fromBlock, toBlock);
  logFetchInflight.set(key, job);
  try { return await job; } finally { logFetchInflight.delete(key); }
}

async function fetchLogsPagedInner(contract, filter, eventName, fromBlock, toBlock) {
  const key = logCacheKey(contract, eventName);
  let cache = readLogCache(key) || { coveredTo: fromBlock - 1, events: [] };
  const snap = await seedCacheFromSnapshot(contract, eventName);
  if (snap && snap.coveredTo > cache.coveredTo) {
    const byId = new Map(cache.events.map((e) => [e.b + ":" + e.i, e]));
    for (const e of snap.events) byId.set(e.b + ":" + e.i, e);
    cache = { coveredTo: snap.coveredTo, events: [...byId.values()] };
  }
  const byId = new Map(cache.events.map((e) => [e.b + ":" + e.i, e]));
  const start = Math.max(fromBlock, cache.coveredTo + 1);
  let complete = true;
  let coveredTo = cache.coveredTo;
  if (start <= toBlock) {
    const pages = [];
    for (let f = start; f <= toBlock; f += LOG_PAGE) pages.push([f, Math.min(toBlock, f + LOG_PAGE - 1)]);
    const providers = logProviders();
    const results = new Array(pages.length);
    let cursor = 0;
    async function worker() {
      while (cursor < pages.length) {
        const idx = cursor++;
        const [f, t] = pages[idx];
        const order = providers.map((_, i) => providers[(i + idx) % providers.length]);
        let done = null;
        for (let attempt = 0; attempt < 2 && !done; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, LOG_RETRY_DELAY_MS));
          for (const p of order) {
            try {
              const logs = await withTimeout(contract.connect(p).queryFilter(filter, f, t), LOG_TIMEOUT_MS);
              done = { f, t, ok: true, logs };
              break;
            } catch { /* try the next provider */ }
          }
        }
        results[idx] = done || { f, t, ok: false, logs: [] };
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOG_CONCURRENCY, pages.length) }, () => worker()));
    const okPages = new Set(results.filter((r) => r.ok).map((r) => r.f));
    for (const r of results) {
      if (!r.ok) { complete = false; continue; }
      for (const l of r.logs) {
        byId.set(l.blockNumber + ":" + l.index, { b: l.blockNumber, i: l.index, topics: [...l.topics], data: l.data });
      }
    }
    // coveredTo advances only past contiguous successful pages.
    let next = start;
    for (const [f, t] of pages) {
      if (!okPages.has(f)) break;
      next = t + 1;
    }
    coveredTo = Math.max(cache.coveredTo, next - 1);
    writeLogCache(key, { coveredTo, events: [...byId.values()].sort((a, b) => a.b - b.b || a.i - b.i) });
  }
  const out = [];
  for (const e of byId.values()) {
    if (e.b < fromBlock || e.b > toBlock) continue;
    try {
      const parsed = contract.interface.parseLog({ topics: e.topics, data: e.data });
      out.push({ args: parsed.args, blockNumber: e.b, index: e.i });
    } catch { /* skip unparseable entries */ }
  }
  out.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  return { logs: out, complete };
}

// ---------- Batched board reads (audit M-12 / L-12) ----------
// One Multicall3 call replaces hundreds of sequential getUser eth_calls.
// Falls back to chunked parallel reads if Multicall3 is unavailable.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];
async function batchGetUsers(addresses) {
  const out = new Map();
  if (!addresses.length) return out;
  try {
    const calls = addresses.map((a) => ({ target: hub.target, allowFailure: true, callData: hub.interface.encodeFunctionData("getUser", [a]) }));
    const res = await callWithFallback((p) =>
      new ethers.Contract(MULTICALL3, MULTICALL3_ABI, p).aggregate3(calls), LOG_TIMEOUT_MS);
    res.forEach((r, i) => {
      if (!r.success) return;
      try {
        const s = hub.interface.decodeFunctionResult("getUser", r.returnData);
        out.set(addresses[i], { best: Number(s[2]), cur: Number(s[1]), total: Number(s[3]) });
      } catch { /* skip undecodable rows */ }
    });
    if (out.size) return out;
  } catch { /* fall through to the chunked fallback */ }
  for (let i = 0; i < addresses.length; i += 20) {
    const chunk = addresses.slice(i, i + 20);
    const settled = await Promise.allSettled(chunk.map(async (a) => {
      const s = await callWithFallback((p) => hub.connect(p).getUser(a), LOG_TIMEOUT_MS);
      return [a, { best: Number(s.bestStreak), cur: Number(s.currentStreak), total: Number(s.totalCheckIns) }];
    }));
    for (const r of settled) if (r.status === "fulfilled") out.set(r.value[0], r.value[1]);
  }
  return out;
}

// ---------- Agent-first preview: live activity feed, recent tips, Mecha gallery ----------
// All read-only, best-effort: any failure leaves the honest empty state in place.
const handleCache = new Map();
async function handleOfCached(addr) {
  const k = addr.toLowerCase();
  if (handleCache.has(k)) return handleCache.get(k);
  let h = "";
  try { h = await callWithFallback((p) => agentId.connect(p).handleOf(addr)); } catch { /* best-effort */ }
  handleCache.set(k, h || "");
  return h || "";
}
function timeAgo(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
async function blockTimes(blockNumbers) {
  const out = new Map();
  await Promise.all([...new Set(blockNumbers)].map(async (n) => {
    try { const b = await callWithFallback((p) => p.getBlock(n)); if (b) out.set(n, Number(b.timestamp)); } catch { /* best-effort */ }
  }));
  return out;
}
const TIER_CLASS = ["t-common", "t-rare", "t-epic", "t-legendary", "t-mythic"];

async function loadActivityFeed() {
  const ul = $("activityFeed");
  if (!ul || !hub) return;
  const showError = () => {
    if (ul.dataset.loaded !== "1") ul.innerHTML = "<li>Couldn't load live activity — the BSC RPC is unavailable right now. Try again in a bit.</li>";
  };
  try {
    const current = await currentBlock();
    const [ci, tp, px, mx] = await Promise.all([
      fetchLogsPaged(hub, hub.filters.CheckIn, "CheckIn", HUB_DEPLOY_BLOCK, current),
      fetchLogsPaged(hub, hub.filters.Tip, "Tip", HUB_DEPLOY_BLOCK, current),
      pass ? fetchLogsPaged(pass, pass.filters.Transfer, "Transfer", HUB_DEPLOY_BLOCK, current) : Promise.resolve({ logs: [], complete: true }),
      mecha ? fetchLogsPaged(mecha, mecha.filters.Transfer, "Transfer", HUB_DEPLOY_BLOCK, current) : Promise.resolve({ logs: [], complete: true }),
    ]);
    const rows = [];
    for (const ev of ci.logs) rows.push({ kind: "checkin", block: ev.blockNumber, idx: ev.index, user: ev.args.user, handle: ev.args.handle, streak: Number(ev.args.streak) });
    for (const ev of tp.logs) rows.push({ kind: "tip", block: ev.blockNumber, idx: ev.index, from: ev.args.from, handle: ev.args.handle, to: ev.args.to, amount: ev.args.amount });
    for (const ev of px.logs) rows.push({ kind: "pass", block: ev.blockNumber, idx: ev.index, to: ev.args.to, id: Number(ev.args.tokenId) });
    for (const ev of mx.logs) rows.push({ kind: "mecha", block: ev.blockNumber, idx: ev.index, to: ev.args.to, id: Number(ev.args.tokenId) });
    rows.sort((a, b) => b.block - a.block || b.idx - a.idx);
    const top = rows.slice(0, 10);
    const allComplete = ci.complete && tp.complete && px.complete && mx.complete;
    if (!top.length) {
      if (allComplete) { ul.innerHTML = "<li>No on-chain activity yet — be the first agent to check in.</li>"; ul.dataset.loaded = "1"; }
      else showError();
      return;
    }
    const times = await blockTimes(top.map((r) => r.block));
    // allSettled: one row failing (e.g. a flaky tier lookup) must never
    // wipe the whole feed — keep every row that rendered.
    const settled = await Promise.allSettled(top.map(async (r) => {
      const t = times.get(r.block) ? timeAgo(times.get(r.block)) : "block " + r.block;
      const link = net.explorer + "/block/" + r.block;
      if (r.kind === "checkin") return `<li><span class="f-ico">✓</span><span class="f-who">${esc(r.handle)}.ai</span><span class="f-what">checked in — streak day ${r.streak}</span><span class="f-time">${t}</span><a class="f-link" href="${link}" target="_blank" rel="noopener">#${r.block}</a></li>`;
      if (r.kind === "tip") {
        const toH = await handleOfCached(r.to);
        return `<li><span class="f-ico">💛</span><span class="f-who">${esc(r.handle)}.ai</span><span class="f-what">tipped ${toH ? esc(toH) + ".ai" : short(r.to)}</span><span class="f-amt">${fmtBnb(r.amount)} BNB</span><span class="f-time">${t}</span></li>`;
      }
      if (r.kind === "pass") {
        const h = await handleOfCached(r.to);
        const label = r.id >= 1 && r.id <= 100 ? "Founding" : "Member";
        return `<li><span class="f-ico">🎫</span><span class="f-who">${h ? esc(h) + ".ai" : short(r.to)}</span><span class="f-what">minted Hub Pass #${String(r.id).padStart(4, "0")} (${label})</span><span class="f-time">${t}</span></li>`;
      }
      const h = await handleOfCached(r.to);
      let tier = "";
      try { tier = await callWithFallback(async (p) => mecha.connect(p).tierName(await mecha.connect(p).tierOf(r.id))); } catch { /* best-effort */ }
      const tc = tier ? TIER_CLASS[["Common", "Rare", "Epic", "Legendary", "Mythic"].indexOf(tier)] || "" : "";
      return `<li><span class="f-ico">🤖</span><span class="f-who">${h ? esc(h) + ".ai" : short(r.to)}</span><span class="f-what">minted Mecha #${String(r.id).padStart(4, "0")}</span>${tier ? `<span class="${tc}">${tier}</span>` : ""}<span class="f-time">${t}</span></li>`;
    }));
    const items = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (!items.length) { showError(); return; }
    ul.innerHTML = items.join("");
    ul.dataset.loaded = "1";
    $("activityUpdated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · refreshes every minute.";
  } catch (e) { console.error(e); showError(); }
}

async function loadRecentTips() {
  const ul = $("recentTips");
  if (!ul || !hub) return;
  const showError = () => {
    if (ul.dataset.loaded !== "1") ul.innerHTML = "<li>Couldn't load recent tips — the BSC RPC is unavailable right now. Try again in a bit.</li>";
  };
  try {
    const current = await currentBlock();
    const { logs: tips, complete } = await fetchLogsPaged(hub, hub.filters.Tip, "Tip", HUB_DEPLOY_BLOCK, current);
    if (!tips.length) {
      if (complete) { ul.innerHTML = "<li>No tips yet — be the first agent to get paid by name.</li>"; ul.dataset.loaded = "1"; }
      else showError();
      return;
    }
    const top = [...tips].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index).slice(0, 6);
    const times = await blockTimes(top.map((e) => e.blockNumber));
    const settled = await Promise.allSettled(top.map(async (ev) => {
      const toH = await handleOfCached(ev.args.to);
      const t = times.get(ev.blockNumber) ? timeAgo(times.get(ev.blockNumber)) : "";
      return `<li><span class="f-ico">💛</span><span class="f-who">${esc(ev.args.handle)}.ai</span><span class="f-what">→ ${toH ? esc(toH) + ".ai" : short(ev.args.to)}</span><span class="f-amt">${fmtBnb(ev.args.amount)} BNB</span><span class="f-time">${t}</span></li>`;
    }));
    const items = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (!items.length) { showError(); return; }
    ul.innerHTML = items.join("");
    ul.dataset.loaded = "1";
  } catch (e) { console.error(e); showError(); }
}

async function loadMechaGallery() {
  const ul = $("latestMecha");
  if (!ul || !mecha) return;
  try {
    const total = Number(await callWithFallback((p) => mecha.connect(p).totalMinted()));
    if (!total) { ul.innerHTML = "<li>No Mecha minted yet — Founding Pass holders mint first.</li>"; return; }
    // Token IDs are RANDOM draws in 1..666, NOT 1..total: ownerOf(54)
    // reverts (ERC721NonexistentToken) because #54 was never minted.
    // The latest mints must come from the Transfer log, never total-k.
    const current = await currentBlock();
    const { logs } = await fetchLogsPaged(mecha, mecha.filters.Transfer, "Transfer", HUB_DEPLOY_BLOCK, current);
    const ids = [...logs].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index).slice(0, 6).map((e) => Number(e.args.tokenId));
    if (!ids.length) { ul.innerHTML = "<li>No Mecha minted yet — Founding Pass holders mint first.</li>"; return; }
    // allSettled: one flaky owner/tier lookup must never wipe the gallery.
    const settled = await Promise.allSettled(ids.map(async (id) => {
      const owner = await callWithFallback((p) => mecha.connect(p).ownerOf(id));
      const [tier, h] = await Promise.all([
        callWithFallback(async (p) => mecha.connect(p).tierName(await mecha.connect(p).tierOf(id))).catch(() => ""),
        handleOfCached(owner),
      ]);
      const tc = tier ? TIER_CLASS[["Common", "Rare", "Epic", "Legendary", "Mythic"].indexOf(tier)] || "" : "";
      return `<li><span class="f-ico">🤖</span><span class="f-who">Mecha #${String(id).padStart(4, "0")}</span>${tier ? `<span class="${tc}">${tier}</span>` : ""}<span class="f-what">owned by ${h ? esc(h) + ".ai" : short(owner)}</span><a class="f-link" href="https://element.market/assets/bsc/${net.mecha}/${id}" target="_blank" rel="noopener">Buy on Element</a></li>`;
    }));
    const items = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    if (!items.length) throw new Error("all gallery lookups failed");
    ul.innerHTML = items.join("");
    ul.dataset.loaded = "1";
  } catch (e) {
    console.error(e);
    if (ul.dataset.loaded !== "1") ul.innerHTML = "<li>Couldn't load the latest Mecha mints right now — try refreshing.</li>";
  }
}

async function updateHeroStats() {
  // Each total is independent: one failing RPC must never blank the other
  // (the old single try/catch left Mecha as "—" when its call flaked).
  if (pass) {
    try { $("heroPassTotal").textContent = String(await callWithFallback((p) => pass.connect(p).totalMinted())); } catch { /* keep previous value */ }
  }
  if (mecha) {
    try { $("heroMechaTotal").textContent = String(await callWithFallback((p) => mecha.connect(p).totalMinted())) + " / 666"; } catch { /* keep previous value */ }
  }
}

$("connectBtn").addEventListener("click", connect);
$("checkinBtn").addEventListener("click", doCheckIn);
$("mintPassBtn").addEventListener("click", doMintPass);
$("mintMechaBtn").addEventListener("click", doMintMecha);
$("tipBtn").addEventListener("click", doTip);
$("tipHandle").addEventListener("input", resolveTip);
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}
// Read-only public preview without a wallet (mainnet only, if deployed):
// contract links, live totals and mint buttons work before connect;
// the mint/check-in/tip buttons ask to connect the wallet first.
(async () => {
  if (CONFIG.mainnet.hub) {
    try {
      provider = new ethers.JsonRpcProvider(CONFIG.mainnet.rpc);
      net = CONFIG.mainnet;
      hub = new ethers.Contract(CONFIG.mainnet.hub, HUB_ABI, provider);
      agentId = new ethers.Contract(CONFIG.agentIdMainnet, AGENT_ID_ABI, provider);
      $("hubLink").href = net.explorer + "/address/" + net.hub;
      $("badgeLink").href = net.explorer + "/address/" + (net.badge || (await hub.badge()));
      if (net.pass) {
        pass = new ethers.Contract(net.pass, PASS_ABI, provider);
        $("passLink").href = net.explorer + "/address/" + net.pass;
        $("passLink2").href = net.explorer + "/address/" + net.pass;
        $("passCard").classList.remove("hidden");
        // Independent try/catch per read: one flaky RPC must never kill the
        // rest of the preview (the old straight awaits aborted the whole
        // init block on the first failure).
        try { $("passTotal").textContent = String(await callWithFallback((p) => pass.connect(p).totalMinted())); } catch { $("passTotal").textContent = "—"; }
        $("passStatus").textContent = "Connect wallet to mint";
        $("mintPassBtn").disabled = false;
        $("mintPassBtn").textContent = "Connect wallet to mint";
      }
      if (net.mecha) {
        mecha = new ethers.Contract(net.mecha, MECHA_ABI, provider);
        $("mechaLink").href = net.explorer + "/address/" + net.mecha;
        $("mechaLink2").href = net.explorer + "/address/" + net.mecha;
        try { $("mechaTotal").textContent = String(await callWithFallback((p) => mecha.connect(p).totalMinted())) + " / 666"; } catch { $("mechaTotal").textContent = "—"; }
        $("mechaStatus").textContent = "Connect wallet to mint";
        $("mintMechaBtn").disabled = false;
        $("mintMechaBtn").textContent = "Connect wallet to mint";
      }
      // Loaders run in parallel: one slow/hung feed must never block the
      // others (previously the sequential chain left the gallery stuck too).
      await Promise.allSettled([loadBoards(), updateHeroStats(), loadActivityFeed(), loadRecentTips(), loadMechaGallery()]);
      setInterval(() => {
        loadActivityFeed().catch(() => {});
        loadRecentTips().catch(() => {});
        loadMechaGallery().catch(() => {});
        updateHeroStats().catch(() => {});
      }, 60000);
    } catch { /* preview is best-effort */ }
  }
})();

const copyBtn = $("copyPromptBtn");
if (copyBtn) copyBtn.addEventListener("click", async () => {
  const text = $("agentPrompt").textContent;
  try {
    await navigator.clipboard.writeText(text);
    $("copyPromptMsg").textContent = "Copied — paste it to your AI agent.";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); $("copyPromptMsg").textContent = "Copied — paste it to your AI agent."; }
    catch { $("copyPromptMsg").textContent = "Copy failed — select the text manually."; }
    ta.remove();
  }
});

// M-13: publish the prompt's SHA-256 and warn if the page copy drifts from
// agent-prompt.txt. Best-effort only: any failure leaves the prompt and the
// copy button working exactly as before.
(async () => {
  try {
    const el = $("promptHash");
    if (!el || !window.crypto || !crypto.subtle) return;
    const enc = new TextEncoder();
    const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const shown = $("agentPrompt").textContent;
    const shownHash = await hex(shown);
    el.textContent = "SHA-256: " + shownHash.slice(0, 16) + "…";
    const res = await fetch("agent-prompt.txt");
    if (!res.ok) return;
    const fileHash = await hex(await res.text());
    if (fileHash !== shownHash) {
      el.textContent = "Warning: the prompt shown here differs from agent-prompt.txt — follow agent-prompt.txt.";
    }
  } catch { /* hash display is best-effort */ }
})();
