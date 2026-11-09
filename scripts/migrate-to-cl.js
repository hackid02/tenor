// One-off: moves Tenor liquidity from the original Mezo stable pools to
// Mezo CL pools and deploys the CL router.
//
//   npx hardhat run scripts/migrate-to-cl.js --network mezoTestnet
//
// Why: stable pools concentrate liquidity at a price of exactly 1, but PT
// trades below 1, so small trades moved the fixed APY a lot. CL pools let
// liquidity sit in the PT price range instead.
const { ethers } = require("hardhat");
const ADDR = require("./lib/addresses");
const D = require("./lib/deployments");
const { createAndSeed } = require("./lib/clpool");

const F = (x) => Number(ethers.formatEther(x)).toFixed(4);
const STABLE_POOL_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function burn(address) returns (uint256,uint256)",
];

// PT price ranges for each market's concentrated position.
const PLAN = {
  main: { apy: 0.12, lowPt: 0.95, highPt: 1.0005 },
  demo: { apy: 0.12, lowPt: 0.995, highPt: 1.0005 },
};

async function main() {
  const [me] = await ethers.getSigners();
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const A = ADDR[cid];
  const dep = D.load(cid);
  const musd = await ethers.getContractAt("MockMUSD", A.musd);

  // 1. Pull liquidity out of the stable pools.
  for (const [key, m] of Object.entries(dep.markets)) {
    if (!m.pool || m.legacyStablePool) continue;
    const lp = new ethers.Contract(m.pool, STABLE_POOL_ABI, me);
    const bal = await lp.balanceOf(me.address);
    if (bal > 0n) {
      await (await lp.transfer(m.pool, bal)).wait();
      await (await lp.burn(me.address)).wait();
      console.log(`${key}: withdrew stable-pool liquidity`);
    }
    m.legacyStablePool = m.pool;
    delete m.pool;
    D.save(cid, dep);
  }

  // 2. Deploy the CL router.
  if (!dep.routerCL) {
    if (dep.router && !dep.legacyStableRouter) dep.legacyStableRouter = dep.router;
    const r = await (await ethers.getContractFactory("TenorRouter")).deploy(A.clFactory);
    await r.waitForDeployment();
    dep.router = await r.getAddress();
    dep.routerCL = true;
    D.save(cid, dep);
    console.log(`TenorRouter (CL): ${dep.router}`);
  }

  // 3. Create and seed a CL pool per market.
  for (const [key, m] of Object.entries(dep.markets)) {
    if (m.pool) continue;
    const market = await ethers.getContractAt("TenorMarket", m.market);
    if (await market.isMatured()) continue;
    const pt = await ethers.getContractAt("TenorToken", m.pt);
    const ptBal = await pt.balanceOf(me.address);
    const musdBal = await musd.balanceOf(me.address);
    // Use the PT we hold and an equal amount of MUSD, keeping 150 MUSD spare for demos.
    const spare = ethers.parseEther("150");
    const musdForPool = key === "main" ? (musdBal - spare < ptBal ? musdBal - spare : ptBal) : ptBal;
    const s = await createAndSeed({ signer: me, A, market, ...PLAN[key], ptAmount: ptBal, musdAmount: musdForPool });
    m.pool = s.pool;
    m.clPosition = { tokenId: s.tokenId ? s.tokenId.toString() : null, tickLower: s.tickLower, tickUpper: s.tickUpper, lowPt: PLAN[key].lowPt, highPt: PLAN[key].highPt };
    D.save(cid, dep);
    console.log(`${key}: CL pool ${s.pool} (offered ${F(ptBal)} PT + ${F(musdForPool)} MUSD) -> PT ${s.ptPrice.toFixed(5)}, fixed APY ${(s.apy * 100).toFixed(2)}%`);
  }
  console.log(`MUSD left: ${F(await musd.balanceOf(me.address))}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
