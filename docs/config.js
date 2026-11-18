// AgentID Hub — network + contract configuration.
// MAINNET ADDRESSES ARE FILLED IN AFTER THE MAINNET DEPLOYMENT.
// Until then the site runs in "coming soon" mode on mainnet and fully on testnet.
const CONFIG = {
  // BSC mainnet (chain 56) — update after deploy:
  mainnet: {
    chainId: 56,
    chainHex: "0x38",
    rpc: "https://bsc-dataseed.binance.org",
    hub: "0xb2d0eBBA5518b874a49e449996b66805f9a93D0f", // AgentIDHub mainnet — deployed 2026-11-18, tx 0xb87a7821daa941896d488c8909f9991438ecbdcd8b8b2ad8954197d5c361bb42
    badge: "0xEd3df65F05091b5629D71CC8D5D1993E2DD7CB42", // StreakBadge mainnet
    explorer: "https://bscscan.com",
  },
  // BSC testnet (chain 97) — update after testnet deploy:
  testnet: {
    chainId: 97,
    chainHex: "0x61",
    rpc: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    hub: "0x14D5D6b97b7c3d22c49FC6De7667374692de5462", // AgentIDHub testnet — deployed 2026-11-18
    badge: "0xB4C3649078556547B432a74E472e4F44F1758Fa3", // StreakBadge testnet
    explorer: "https://testnet.bscscan.com",
  },
  // Official Agent ID contract (same on mainnet; testnet uses a mock — see README).
  agentIdMainnet: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  defaultNet: "mainnet",
};
