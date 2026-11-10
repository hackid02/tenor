// Prints the fixed APY a "Fix my yield" trade of each size would lock right
// now, by simulating TenorRouter.buyPT from the deployer wallet (read-only).
//   npx hardhat run scripts/depth.js --network mezoTestnet
const { ethers } = require("hardhat");
const D = require("./lib/deployments");

(async () => {
  const [me] = await ethers.getSigners();
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const dep = D.load(cid);
  const m = dep.markets[process.env.KEY || "main"];
  const r = await ethers.getContractAt("TenorRouter", dep.router, me);
  const secs = m.maturity - (await ethers.provider.getBlock("latest")).timestamp;
  const row = [];
  for (const a of [10, 100, 300, 500, 800, 1000]) {
    try {
      const out = await r.buyPT.staticCall(m.market, m.pool, ethers.parseEther(String(a)), 0, me.address);
      const apy = Math.pow(Number(out) / Number(ethers.parseEther(String(a))), (365 * 86400) / secs) - 1;
      row.push(`${a} MUSD: ${(apy * 100).toFixed(2)}%`);
    } catch {
      row.push(`${a} MUSD: too big`);
    }
  }
  console.log(row.join(" | "));
})();
