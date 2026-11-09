// Creates the PT/MUSD stable pool on Mezo Pools for a market and seeds it at
// a target fixed APY.
//
//   npx hardhat run scripts/seed-pool.js --network mezoTestnet
//
// Options (environment variables):
//   KEY   market key in deployments/<chainId>.json (default "main")
//   SEED  MUSD per side of the initial 1:1 deposit (default 300)
//   APY   target starting fixed APY, e.g. 0.12 (default)
//
// Mezo stable pools must start 1:1, so we seed 1:1 and then sell PT into
// the pool until PT trades at the discount implied by APY.
const { ethers, network } = require("hardhat");
const ADDR = require("./lib/addresses");
const D = require("./lib/deployments");
const { fundIfFork } = require("./lib/fund");

const E = (n) => ethers.parseEther(String(n));
const POOL_ABI = [
  "function token0() view returns (address)",
  "function getAmountOut(uint256,address) view returns (uint256)",
  "function getReserves() view returns (uint256,uint256,uint256)",
  "function mint(address) returns (uint256)",
  "function totalSupply() view returns (uint256)",
];
const FACTORY_ABI = [
  "function createPool(address,address,bool) returns (address)",
  "function getPool(address,address,bool) view returns (address)",
  "function getFee(address,bool) view returns (uint256)",
];

// Marginal MUSD per PT for a Solidly stable pool with r = MUSD/PT reserves.
const marginal = (r) => (3 * r + r ** 3) / (1 + 3 * r * r);

function solveRatio(targetPrice) {
  let lo = 0.01, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (marginal(mid) > targetPrice) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const A = ADDR[cid] || ADDR[31611];
  const key = process.env.KEY || "main";
  const seed = Number(process.env.SEED || 300);
  const apy = Number(process.env.APY || 0.12);

  const dep = D.load(cid);
  const m = dep.markets[key];
  if (!m) throw new Error(`No market "${key}" in deployments/${cid}.json. Run deploy.js first.`);

  const market = await ethers.getContractAt("TenorMarket", m.market);
  const router = await ethers.getContractAt("TenorRouter", dep.router);
  const musd = await ethers.getContractAt("MockMUSD", A.musd);
  const pt = await ethers.getContractAt("TenorToken", m.pt);
  const factory = new ethers.Contract(A.poolFactory, FACTORY_ABI, deployer);

  const block = await ethers.provider.getBlock("latest");
  const years = (m.maturity - block.timestamp) / (365 * 24 * 3600);
  if (years <= 0) throw new Error("Market already matured");
  const targetPrice = Math.pow(1 + apy, -years);
  const r = solveRatio(targetPrice);
  const xAfter = seed * Math.pow(2 / (r + r ** 3), 0.25);
  const fee = Number(await factory.getFee(ethers.ZeroAddress, true).catch(() => 1n)) / 10000;
  const ptToSell = (xAfter - seed) / (1 - fee);
  const deposit = Math.ceil(seed + ptToSell + 1);

  console.log(`Market ${key} (${m.label}) on ${network.name}`);
  console.log(`Target ${(apy * 100).toFixed(2)}% APY over ${(years * 365).toFixed(1)} days -> PT price ${targetPrice.toFixed(5)} MUSD`);
  console.log(`Plan: deposit ${deposit} MUSD, seed ${seed} PT + ${seed} MUSD, sell ${ptToSell.toFixed(2)} PT`);
  console.log(`MUSD needed: ${deposit + seed}`);

  await fundIfFork(deployer.address, A, E(deposit + seed + 10));
  const bal = await musd.balanceOf(deployer.address);
  if (bal < E(deposit + seed)) {
    throw new Error(`Not enough MUSD: have ${ethers.formatEther(bal)}, need ${deposit + seed}. Lower SEED or swap more BTC to MUSD.`);
  }

  // 1. Mint PT + YT
  await (await musd.approve(m.market, E(deposit))).wait();
  await (await market.deposit(E(deposit), deployer.address)).wait();
  console.log(`1/4 Deposited ${deposit} MUSD -> ${deposit} PT + ${deposit} YT`);

  // 2. Create pool
  let poolAddr = await factory.getPool(A.musd, m.pt, true);
  if (poolAddr === ethers.ZeroAddress) {
    await (await factory.createPool(A.musd, m.pt, true)).wait();
    poolAddr = await factory.getPool(A.musd, m.pt, true);
  }
  const pool = new ethers.Contract(poolAddr, POOL_ABI, deployer);
  console.log(`2/4 Pool: ${poolAddr}`);

  // 3. Seed 1:1
  if ((await pool.totalSupply()) === 0n) {
    await (await pt.transfer(poolAddr, E(seed))).wait();
    await (await musd.transfer(poolAddr, E(seed))).wait();
    await (await pool.mint(deployer.address)).wait();
    console.log(`3/4 Seeded ${seed} PT + ${seed} MUSD`);
  } else {
    console.log("3/4 Pool already has liquidity, skipping seed");
  }

  // 4. Price it
  await (await pt.approve(dep.router, ethers.MaxUint256)).wait();
  const sellWei = E(ptToSell.toFixed(6));
  await (await router.sellPT(m.market, poolAddr, sellWei, 0, deployer.address)).wait();
  const quoteIn = E(1);
  const ptOut = await pool.getAmountOut(quoteIn, A.musd);
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const yrs = (m.maturity - now) / (365 * 24 * 3600);
  const spotApy = Math.pow(Number(ptOut) / Number(quoteIn), 1 / yrs) - 1;
  console.log(`4/4 Sold ${ptToSell.toFixed(2)} PT. 1 MUSD buys ${ethers.formatEther(ptOut)} PT -> fixed APY ${(spotApy * 100).toFixed(2)}%`);

  m.pool = poolAddr;
  m.seed = { seed, deposit, ptSold: ptToSell, targetApy: apy, spotApy };
  D.save(cid, dep);
  console.log(`Saved to deployments/${cid}.json`);
}

module.exports = main;
if (!process.env.TENOR_NO_AUTORUN) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
