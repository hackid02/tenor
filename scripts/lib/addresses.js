// Mezo contract addresses used by Tenor. Verified on-chain / in Mezo docs on 2026-11-09.
module.exports = {
  31611: {
    name: "Mezo Testnet",
    musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    smusd: "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16",
    smusdStrategy: "0x6abE6853f3006f304709084AC37f826Be50847E0",
    // Mezo Pools: basic (stable/volatile) pools
    poolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A",
    poolRouter: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
    // Mezo Pools: concentrated liquidity (Slipstream)
    clFactory: "0x7B61BC8Aa460476d142F1CD107A47297002f69ff",
    clPositionManager: "0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062",
    clSwapRouter: "0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a",
    explorer: "https://explorer.test.mezo.org",
  },
  31612: {
    name: "Mezo Mainnet",
    musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
    smusd: "0xb4D498029af77680cD1eF828b967f010d06C51CC",
    smusdStrategy: "0x0C0944713c185ea3e64F5609ECee3fB3C054a295",
    poolFactory: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
    poolRouter: "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706",
    clFactory: "0xBB24AF5c6fB88F1d191FA76055e30BF881BeEb79",
    clPositionManager: "0x509Bc221df2B83927c695FA0bb0f5B21053C874c",
    clSwapRouter: "0x37cDd11919ec3860eaD9efB8673d7476E5326225",
    explorer: "https://explorer.mezo.org",
  },
};
