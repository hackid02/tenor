// Deploys the TenorRouter (once per chain) and one TenorMarket.
//
//   npx hardhat run scripts/deploy.js --network mezoTestnet
//
// Options (environment variables):
//   MATURITY  ISO date, e.g. 2026-12-31T00:00:00Z (default)
//   LABEL     short market label, e.g. DEC26 (default)
//   KEY       name of this market in deployments/<chainId>.json (default "main")
//   FEE_BPS   protocol fee on yield in basis points (default 500 = 5%)
const { ethers, network } = require("hardhat");
const ADDR = require("./lib/addresses");
const D = require("./lib/deployments");

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const cid = Number(chainId);
  const A = ADDR[cid] || ADDR[31611]; // local fork of testnet uses testnet addresses
  const maturityIso = process.env.MATURITY || "2026-12-31T00:00:00Z";
  const maturity = Math.floor(new Date(maturityIso).getTime() / 1000);
  const label = process.env.LABEL || "DEC26";
  const key = process.env.KEY || "main";
  const feeBps = Number(process.env.FEE_BPS || 500);

  console.log(`Network: ${network.name} (chain ${cid})  Deployer: ${deployer.address}`);
  console.log(`BTC for gas: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  const dep = D.load(cid);

  if (!dep.router) {
    const router = await (await ethers.getContractFactory("TenorRouter")).deploy();
    await router.waitForDeployment();
    dep.router = await router.getAddress();
    console.log(`TenorRouter: ${dep.router}`);
    D.save(cid, dep);
  } else {
    console.log(`TenorRouter (existing): ${dep.router}`);
  }

  if (dep.markets[key]) throw new Error(`Market "${key}" already deployed: ${dep.markets[key].market}`);

  const market = await (await ethers.getContractFactory("TenorMarket")).deploy(
    A.smusd, maturity, deployer.address, feeBps, label
  );
  await market.waitForDeployment();
  const m = {
    market: await market.getAddress(),
    pt: await market.pt(),
    yt: await market.yt(),
    maturity,
    maturityIso,
    label,
    feeBps,
    treasury: deployer.address,
    deployTx: market.deploymentTransaction().hash,
  };
  dep.markets[key] = m;
  D.save(cid, dep);
  console.log(`TenorMarket "${key}" (${label}, matures ${maturityIso}): ${m.market}`);
  console.log(`  PT: ${m.pt}\n  YT: ${m.yt}`);
}

module.exports = main;
if (!process.env.TENOR_NO_AUTORUN) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
