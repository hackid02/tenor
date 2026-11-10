// Deploys TenorQuoter (read-only quotes for the app) and records it.
//   npx hardhat run scripts/deploy-quoter.js --network mezoTestnet
const { ethers } = require("hardhat");
const D = require("./lib/deployments");

(async () => {
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const dep = D.load(cid);
  const q = await (await ethers.getContractFactory("TenorQuoter")).deploy();
  await q.waitForDeployment();
  dep.quoter = await q.getAddress();
  D.save(cid, dep);
  console.log(`TenorQuoter: ${dep.quoter}`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
