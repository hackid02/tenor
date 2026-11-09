// Shows which wallet .env points to and its balances. Never prints the key.
//   npx hardhat run scripts/whoami.js --network mezoTestnet
const { ethers } = require("hardhat");
const ADDR = require("./lib/addresses");

(async () => {
  const signers = await ethers.getSigners();
  if (!signers.length) throw new Error("No PRIVATE_KEY found in .env");
  const me = signers[0];
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const musd = await ethers.getContractAt("MockMUSD", ADDR[cid].musd);
  console.log(`Network:  ${ADDR[cid].name}`);
  console.log(`Address:  ${me.address}`);
  console.log(`BTC:      ${ethers.formatEther(await ethers.provider.getBalance(me.address))}`);
  console.log(`MUSD:     ${ethers.formatEther(await musd.balanceOf(me.address))}`);
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
