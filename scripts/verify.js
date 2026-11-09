// Verifies every Tenor contract on the Mezo explorer (Blockscout).
//   npx hardhat run scripts/verify.js --network mezoTestnet
const hre = require("hardhat");
const D = require("./lib/deployments");
const ADDR = require("./lib/addresses");

async function v(address, constructorArguments, contract) {
  try {
    await hre.run("verify:verify", { address, constructorArguments, contract });
    console.log(`verified ${address}`);
  } catch (e) {
    const msg = String(e.message || e);
    console.log(/already verified/i.test(msg) ? `already verified ${address}` : `FAILED ${address}: ${msg.split("\n")[0]}`);
  }
}

(async () => {
  const cid = Number((await hre.ethers.provider.getNetwork()).chainId);
  const dep = D.load(cid);
  await v(dep.router, dep.routerCL ? [ADDR[cid].clFactory] : [], "contracts/TenorRouter.sol:TenorRouter");
  for (const [key, m] of Object.entries(dep.markets)) {
    await v(m.market, [ADDR[cid].smusd, m.maturity, m.treasury, m.feeBps, m.label], "contracts/TenorMarket.sol:TenorMarket");
    await v(m.pt, [`Tenor PT-sMUSD ${m.label}`, `PT-sMUSD-${m.label}`, false], "contracts/TenorToken.sol:TenorToken");
    await v(m.yt, [`Tenor YT-sMUSD ${m.label}`, `YT-sMUSD-${m.label}`, true], "contracts/TenorToken.sol:TenorToken");
  }
})();
