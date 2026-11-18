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
    pass: "", // HubPass mainnet — deploys only on Faisal's word (under review)
    mecha: "", // MechaAgent mainnet — deploys only on Faisal's word (under review)
    explorer: "https://bscscan.com",
  },
  // BSC testnet (chain 97) — update after testnet deploy:
  testnet: {
    chainId: 97,
    chainHex: "0x61",
    rpc: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    hub: "0x5C86Bc350D5c2ae8eD8BaeBB662056F89007B82B", // AgentIDHub testnet v3 — redeployed 2026-11-18 (tiered badge art, 1000-day Diamond)
    badge: "0x8fA9558F9ED70a526Fa9447Bd0b9e31FE3451359", // StreakBadge testnet v3
    pass: "0x27d816b93b2251c71ad31921e55847ff85e15557", // HubPass testnet v3.1 — Founding soulbound, deployed 2026-11-18 (supersedes 0xB900… tradable v3)
    mecha: "0x8574a447f5806fe9c1746e8fb0c928ff3f594c9f", // MechaAgent testnet — random tier + number, supply 666, deployed 2026-11-18
    explorer: "https://testnet.bscscan.com",
  },
  // Official Agent ID contract (same on mainnet; testnet uses a mock — see README).
  agentIdMainnet: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  defaultNet: "mainnet",
};
