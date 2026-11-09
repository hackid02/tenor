require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PK = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const RPC = {
  testnet: "https://rpc.test.mezo.org",
  mainnet: "https://rpc-http.mezo.boar.network",
};

// FORK=testnet or FORK=mainnet runs the local Hardhat network as a copy of that chain.
const fork = process.env.FORK;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: fork
      ? { chainId: 31337, forking: { url: RPC[fork] } }
      : {},
    // Gas used varies block to block (pool price observations, Mezo fee
    // distribution inside sMUSD.deposit). Gas is cheap, so pad estimates 2x.
    mezoTestnet: { url: RPC.testnet, chainId: 31611, accounts: PK, gasMultiplier: 2 },
    mezo: { url: RPC.mainnet, chainId: 31612, accounts: PK, gasMultiplier: 2 },
  },
  etherscan: {
    apiKey: { mezoTestnet: "empty", mezo: "empty" },
    customChains: [
      {
        network: "mezoTestnet",
        chainId: 31611,
        urls: { apiURL: "https://api.explorer.test.mezo.org/api", browserURL: "https://explorer.test.mezo.org" },
      },
      {
        network: "mezo",
        chainId: 31612,
        urls: { apiURL: "https://api.explorer.mezo.org/api", browserURL: "https://explorer.mezo.org" },
      },
    ],
  },
  sourcify: { enabled: false },
  mocha: { timeout: 600000 },
};
