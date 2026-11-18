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
const AGENT_ID_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function handleOf(address) view returns (string)",
  "function ownerOfHandle(string) view returns (address)",
  "function isValidHandle(string) view returns (bool)",
];

let provider, signer, userAddr, net, hub, agentId;
let deployBlock = 0;

const $ = (id) => document.getElementById(id);
const short = (a) => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const fmtBnb = (w) => Number(ethers.formatEther(w)).toFixed(4);

function normHandle(raw) {
  let h = (raw || "").trim().toLowerCase();
  if (h.endsWith(".ai")) h = h.slice(0, -3);
  return h;
}

async function connect() {
  if (!window.ethereum) { alert("No wallet found. Install MetaMask or Binance Wallet first."); return; }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const netInfo = await provider.getNetwork();
    net = Number(netInfo.chainId) === 97 ? CONFIG.testnet : CONFIG.mainnet;
    if (Number(netInfo.chainId) !== net.chainId) {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: net.chainHex }] });
    }
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddr = await signer.getAddress();
    $("connectBtn").textContent = short(userAddr);
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
    await loadYou();
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

async function doCheckIn() {
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

$("connectBtn").addEventListener("click", connect);
$("checkinBtn").addEventListener("click", doCheckIn);
$("tipBtn").addEventListener("click", doTip);
$("tipHandle").addEventListener("input", resolveTip);
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}
// Read-only leaderboard preview without a wallet (mainnet only, if deployed).
(async () => {
  if (CONFIG.mainnet.hub) {
    try {
      provider = new ethers.JsonRpcProvider(CONFIG.mainnet.rpc);
      net = CONFIG.mainnet;
      hub = new ethers.Contract(CONFIG.mainnet.hub, HUB_ABI, provider);
      agentId = new ethers.Contract(CONFIG.agentIdMainnet, AGENT_ID_ABI, provider);
      await loadBoards();
    } catch { /* preview is best-effort */ }
  }
})();
