// Compares TenorQuoter against real router simulations (both eth_call).
//   npx hardhat run scripts/check-quoter.js --network mezoTestnet
const { ethers } = require("hardhat");
const D = require("./lib/deployments");
const E = (n) => ethers.parseEther(String(n));
const cl = require("./lib/cl");
// Price limits as sqrtPriceX96: stop PT buys at 1.01 MUSD and PT sells at 0.80.
async function limits(m) {
  const pool = new ethers.Contract(m.pool, cl.CL_POOL_ABI, ethers.provider);
  const ptIs0 = (await pool.token0()).toLowerCase() === m.pt.toLowerCase();
  const at = (ptPrice) => cl.sqrtX96(cl.poolPriceFromPt(ptPrice, ptIs0));
  return { up: at(1.01), down: at(0.8) };
}
const F = (x) => Number(ethers.formatEther(x)).toFixed(6);

(async () => {
  const [me] = await ethers.getSigners();
  const dep = D.load(Number((await ethers.provider.getNetwork()).chainId));
  const m = dep.markets[process.env.KEY || "main"];
  const L = await limits(m);
  const q = await ethers.getContractAt("TenorQuoter", dep.quoter);
  const r = await ethers.getContractAt("TenorRouter", dep.router, me);
  let bad = 0;
  const cmp = (label, a, b) => {
    const ok = a === b;
    if (!ok) bad++;
    console.log(`${ok ? "MATCH" : "DIFF "} ${label}: quoter ${F(a)} router ${F(b)}`);
  };
  for (const a of [10, 300, 500]) {
    const qb = await q.quoteBuyPT.staticCall(m.pool, m.pt, E(a), L.up);
    cmp(`buyPT ${a} MUSD -> PT`, qb.amountOut, await r.buyPT.staticCall(m.market, m.pool, E(a), 0, me.address));
    const qs = await q.quoteSellPT.staticCall(m.pool, m.pt, E(a / 100), L.down);
    cmp(`sellPT ${a / 100} PT -> MUSD`, qs.amountOut, await r.sellPT.staticCall(m.market, m.pool, E(a / 100), 0, me.address));
    const qe = await q.quoteExactPT.staticCall(m.pool, m.pt, E(a), L.up);
    cmp(`cashOut ${a} MUSD -> MUSD now`, E(a) - qe.amountIn, await r.cashOutYield.staticCall(m.market, m.pool, E(a), 0, me.address));
    cmp(`buyYT ${a / 100} YT cost`, E(a / 100) - (await q.quoteSellPT.staticCall(m.pool, m.pt, E(a / 100), L.down)).amountOut,
      await r.buyYT.staticCall(m.market, m.pool, E(a / 100), E(1000), me.address));
  }
  const big = await q.quoteBuyPT.staticCall(m.pool, m.pt, E(5000), L.up);
  console.log(`partial-fill check: 5000 MUSD filled=${big.filled} (pool took ${F(big.amountIn)})`);
  console.log(bad ? `${bad} mismatches` : "all quotes match the router exactly");
})().catch((e) => { console.error(e); process.exitCode = 1; });
