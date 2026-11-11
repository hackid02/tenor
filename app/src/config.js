import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import contracts from "./generated/contracts.json";

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } },
  // Standard Multicall3 is deployed on Mezo; batches all reads into one call.
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

// Mezo mainnet is read-only here: the live sMUSD rate is shown for comparison.
export const MEZO_MAINNET_RPC = "https://rpc-http.mezo.boar.network";
export const MAINNET_SMUSD = "0xb4D498029af77680cD1eF828b967f010d06C51CC";

export const wagmiConfig = createConfig({
  chains: [mezoTestnet],
  connectors: [injected()],
  transports: { [mezoTestnet.id]: http() },
});

export const CHAIN = contracts.chains[String(mezoTestnet.id)];
export const ABI = contracts.abi;

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
];

export const POOL_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  {
    type: "function", name: "slot0", stateMutability: "view", inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { type: "uint16" },
      { type: "uint16" }, { type: "uint16" }, { type: "bool" },
    ],
  },
];

// Mezo MUSD loans are fixed-rate (Mezo docs and app, Nov 2026).
export const MUSD_BORROW_RATE = 0.01;
export const MUSD_MIN_LOAN = 1800;

export const LINKS = {
  github: "https://github.com/hackid02/tenor",
  proof: "https://github.com/hackid02/tenor/blob/main/PROOF.md",
  feedback: "https://github.com/hackid02/tenor/issues/new?template=tester-feedback.yml",
  testing: "https://github.com/hackid02/tenor/blob/main/docs/TESTING.md",
  faucet: "https://faucet.test.mezo.org",
  mezoApp: "https://testnet.mezo.org",
  explorer: mezoTestnet.blockExplorers.default.url,
};
