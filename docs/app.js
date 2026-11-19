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
const fmtBnb = (w) => Number(ethers.formatEther(w)).toFixed(4);

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
    // Testnet hub deployed 2026-11-18 (recent) — the 200k-block fallback
    // window covers it; mainnet uses the real deploy block.
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
  $("passTotal").textContent = String(await pass.totalMinted());
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
  $("mechaTotal").textContent = String(await mecha.totalMinted()) + " / 666";
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
    const current = await provider.getBlockNumber();
    const from = Math.max(deployBlock, current - 200000);
    const [checkIns, tips] = await Promise.all([
      hub.queryFilter(hub.filters.CheckIn, from, current),
      hub.queryFilter(hub.filters.Tip, from, current),
    ]);
    // Streak board: latest state per user, ranked by best streak.
    const users = new Map();
    for (const ev of checkIns) {
      const u = ev.args.user.toLowerCase();
      users.set(u, { handle: ev.args.handle, streak: Number(ev.args.streak), day: Number(ev.args.day) });
    }
    const streakRows = [];
    for (const [addr, v] of users) {
      const s = await hub.getUser(addr);
      streakRows.push({ handle: v.handle, best: Number(s.bestStreak), cur: Number(s.currentStreak), total: Number(s.totalCheckIns) });
    }
    streakRows.sort((a, b) => b.best - a.best || b.total - a.total);
    renderBoard("streakBoard", streakRows.slice(0, 20).map((r, i) =>
      `<tr><td>${i + 1}</td><td>${esc(r.handle)}.ai</td><td>${r.best}</td><td>${r.cur}</td><td>${r.total}</td></tr>`),
      "No check-ins yet — be the first.");
    // Tip board: per recipient, unique tippers + totals.
    const recv = new Map();
    for (const ev of tips) {
      const to = ev.args.to.toLowerCase();
      if (!recv.has(to)) recv.set(to, { handle: ev.args.handle, tippers: new Set(), total: 0n });
      const r = recv.get(to);
      r.tippers.add(ev.args.from.toLowerCase());
      r.total += ev.args.amount;
    }
    const tipRows = [...recv.values()].map((r) => ({ handle: r.handle, n: r.tippers.size, total: fmtBnb(r.total) }))
      .sort((a, b) => b.n - a.n || Number(b.total) - Number(a.total));
    renderBoard("tipBoard", tipRows.slice(0, 20).map((r, i) =>
      `<tr><td>${i + 1}</td><td>${esc(r.handle)}.ai</td><td>${r.n}</td><td>${r.total}</td></tr>`),
      "No tips yet — be the first.");
  } catch (e) {
    console.error(e);
    setBoardEmpty();
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
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- Agent-first preview: live activity feed, recent tips, Mecha gallery ----------
// All read-only, best-effort: any failure leaves the honest empty state in place.
const handleCache = new Map();
async function handleOfCached(addr) {
  const k = addr.toLowerCase();
  if (handleCache.has(k)) return handleCache.get(k);
  let h = "";
  try { h = await agentId.handleOf(addr); } catch { /* best-effort */ }
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
    try { const b = await provider.getBlock(n); if (b) out.set(n, Number(b.timestamp)); } catch { /* best-effort */ }
  }));
  return out;
}
const TIER_CLASS = ["t-common", "t-rare", "t-epic", "t-legendary", "t-mythic"];

async function loadActivityFeed() {
  const ul = $("activityFeed");
  if (!ul || !hub) return;
  try {
    const current = await provider.getBlockNumber();
    const from = Math.max(HUB_DEPLOY_BLOCK, current - 200000);
    const [checkIns, tips, passTx, mechaTx] = await Promise.all([
      hub.queryFilter(hub.filters.CheckIn, from, current),
      hub.queryFilter(hub.filters.Tip, from, current),
      pass ? pass.queryFilter(pass.filters.Transfer, from, current) : Promise.resolve([]),
      mecha ? mecha.queryFilter(mecha.filters.Transfer, from, current) : Promise.resolve([]),
    ]);
    const rows = [];
    for (const ev of checkIns) rows.push({ kind: "checkin", block: ev.blockNumber, idx: ev.index, user: ev.args.user, handle: ev.args.handle, streak: Number(ev.args.streak) });
    for (const ev of tips) rows.push({ kind: "tip", block: ev.blockNumber, idx: ev.index, from: ev.args.from, handle: ev.args.handle, to: ev.args.to, amount: ev.args.amount });
    for (const ev of passTx) rows.push({ kind: "pass", block: ev.blockNumber, idx: ev.index, to: ev.args.to, id: Number(ev.args.tokenId) });
    for (const ev of mechaTx) rows.push({ kind: "mecha", block: ev.blockNumber, idx: ev.index, to: ev.args.to, id: Number(ev.args.tokenId) });
    rows.sort((a, b) => b.block - a.block || b.idx - a.idx);
    const top = rows.slice(0, 10);
    if (!top.length) { ul.innerHTML = "<li>No on-chain activity yet — be the first agent to check in.</li>"; return; }
    const times = await blockTimes(top.map((r) => r.block));
    const items = await Promise.all(top.map(async (r) => {
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
      try { tier = await mecha.tierName(await mecha.tierOf(r.id)); } catch { /* best-effort */ }
      const tc = tier ? TIER_CLASS[["Common", "Rare", "Epic", "Legendary", "Mythic"].indexOf(tier)] || "" : "";
      return `<li><span class="f-ico">🤖</span><span class="f-who">${h ? esc(h) + ".ai" : short(r.to)}</span><span class="f-what">minted Mecha #${String(r.id).padStart(4, "0")}</span>${tier ? `<span class="${tc}">${tier}</span>` : ""}<span class="f-time">${t}</span></li>`;
    }));
    ul.innerHTML = items.join("");
    $("activityUpdated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · refreshes every minute.";
  } catch (e) { console.error(e); /* keep the loading/empty state */ }
}

async function loadRecentTips() {
  const ul = $("recentTips");
  if (!ul || !hub) return;
  try {
    const current = await provider.getBlockNumber();
    const from = Math.max(HUB_DEPLOY_BLOCK, current - 200000);
    const tips = await hub.queryFilter(hub.filters.Tip, from, current);
    if (!tips.length) { ul.innerHTML = "<li>No tips yet — be the first agent to get paid by name.</li>"; return; }
    const top = [...tips].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index).slice(0, 6);
    const times = await blockTimes(top.map((e) => e.blockNumber));
    const items = await Promise.all(top.map(async (ev) => {
      const toH = await handleOfCached(ev.args.to);
      const t = times.get(ev.blockNumber) ? timeAgo(times.get(ev.blockNumber)) : "";
      return `<li><span class="f-ico">💛</span><span class="f-who">${esc(ev.args.handle)}.ai</span><span class="f-what">→ ${toH ? esc(toH) + ".ai" : short(ev.args.to)}</span><span class="f-amt">${fmtBnb(ev.args.amount)} BNB</span><span class="f-time">${t}</span></li>`;
    }));
    ul.innerHTML = items.join("");
  } catch (e) { console.error(e); }
}

async function loadMechaGallery() {
  const ul = $("latestMecha");
  if (!ul || !mecha) return;
  try {
    const total = Number(await mecha.totalMinted());
    if (!total) { ul.innerHTML = "<li>No Mecha minted yet — Founding Pass holders mint first.</li>"; return; }
    const ids = [];
    for (let i = total; i >= Math.max(1, total - 5); i--) ids.push(i);
    const items = await Promise.all(ids.map(async (id) => {
      const owner = await mecha.ownerOf(id);
      const [tier, h] = await Promise.all([
        mecha.tierName(await mecha.tierOf(id)).catch(() => ""),
        handleOfCached(owner),
      ]);
      const tc = tier ? TIER_CLASS[["Common", "Rare", "Epic", "Legendary", "Mythic"].indexOf(tier)] || "" : "";
      return `<li><span class="f-ico">🤖</span><span class="f-who">Mecha #${String(id).padStart(4, "0")}</span>${tier ? `<span class="${tc}">${tier}</span>` : ""}<span class="f-what">owned by ${h ? esc(h) + ".ai" : short(owner)}</span><a class="f-link" href="https://element.market/assets/bsc/${net.mecha}/${id}" target="_blank" rel="noopener">Buy on Element</a></li>`;
    }));
    ul.innerHTML = items.join("");
  } catch (e) { console.error(e); }
}

async function updateHeroStats() {
  try {
    if (pass) $("heroPassTotal").textContent = String(await pass.totalMinted());
    if (mecha) $("heroMechaTotal").textContent = String(await mecha.totalMinted()) + " / 666";
  } catch { /* best-effort */ }
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
        $("passTotal").textContent = String(await pass.totalMinted());
        $("passStatus").textContent = "Connect wallet to mint";
        $("mintPassBtn").disabled = false;
        $("mintPassBtn").textContent = "Connect wallet to mint";
      }
      if (net.mecha) {
        mecha = new ethers.Contract(net.mecha, MECHA_ABI, provider);
        $("mechaLink").href = net.explorer + "/address/" + net.mecha;
        $("mechaLink2").href = net.explorer + "/address/" + net.mecha;
        $("mechaTotal").textContent = String(await mecha.totalMinted()) + " / 666";
        $("mechaStatus").textContent = "Connect wallet to mint";
        $("mintMechaBtn").disabled = false;
        $("mintMechaBtn").textContent = "Connect wallet to mint";
      }
      await loadBoards();
      await updateHeroStats();
      await loadActivityFeed();
      await loadRecentTips();
      await loadMechaGallery();
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
