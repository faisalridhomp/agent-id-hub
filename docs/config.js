// AgentID Hub — network + contract configuration.
// MAINNET ADDRESSES ARE FILLED IN AFTER THE MAINNET DEPLOYMENT.
// Until then the site runs in "coming soon" mode on mainnet and fully on testnet.
const CONFIG = {
  // BSC mainnet (chain 56) — v3 live 2026-11-18 ~22:40 WIB:
  mainnet: {
    chainId: 56,
    chainHex: "0x38",
    rpc: "https://bsc-dataseed.binance.org",
    hub: "0x14D5D6b97b7c3d22c49FC6De7667374692de5462", // AgentIDHub mainnet v3 — redeployed 2026-11-18, tx 0x4b3a9db29113c7acd988cc10561e367ed4197ba42fa978a2a5a9a6121c62bcef (tiered badge art, 1000-day Diamond; supersedes v1 0xb2d0…)
    badge: "0xB4C3649078556547B432a74E472e4F44F1758Fa3", // StreakBadge mainnet v3
    pass: "0x3Ae82E031702166B0cCFBFbf037f364998DB0688", // HubPass mainnet — Founding (1–100) soulbound, Member (101+) tradable, tx 0x30657d9e64a5958ad10b3c9064eb0b329355d716ccf06000c41273a85495246d
    mecha: "0x59E3aaF9e0392aAdCE143793372F19D6cCf21e01", // MechaAgent mainnet — random tier + number, supply 666, tx 0xe1033409baadaa38c73f08d88db81ffcc61be7a7b3b30544f389daffb5bf854e
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
