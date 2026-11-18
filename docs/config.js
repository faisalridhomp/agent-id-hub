// AgentID Hub — network + contract configuration.
// MAINNET ADDRESSES ARE FILLED IN AFTER THE MAINNET DEPLOYMENT.
// Until then the site runs in "coming soon" mode on mainnet and fully on testnet.
const CONFIG = {
  // BSC mainnet (chain 56) — update after deploy:
  mainnet: {
    chainId: 56,
    chainHex: "0x38",
    rpc: "https://bsc-dataseed.binance.org",
    hub: "", // AgentIDHub mainnet address (set after deploy)
    badge: "", // StreakBadge mainnet address (set after deploy)
    explorer: "https://bscscan.com",
  },
  // BSC testnet (chain 97) — update after testnet deploy:
  testnet: {
    chainId: 97,
    chainHex: "0x61",
    rpc: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    hub: "", // AgentIDHub testnet address (set after deploy)
    badge: "", // StreakBadge testnet address (set after deploy)
    explorer: "https://testnet.bscscan.com",
  },
  // Official Agent ID contract (same on mainnet; testnet uses a mock — see README).
  agentIdMainnet: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  defaultNet: "mainnet",
};
