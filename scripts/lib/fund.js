// Rehearsals only: on a local fork, give the deployer test MUSD and BTC gas
// by impersonating the sMUSD strategy. Never runs on a real network.
const { ethers, network } = require("hardhat");

async function fundIfFork(addr, A, musdAmount) {
  if (network.name !== "hardhat") return;
  const h = require("@nomicfoundation/hardhat-network-helpers");
  await h.setBalance(addr, ethers.parseEther("10"));
  await h.impersonateAccount(A.smusdStrategy);
  await h.setBalance(A.smusdStrategy, ethers.parseEther("10"));
  const whale = await ethers.getSigner(A.smusdStrategy);
  const musd = await ethers.getContractAt("MockMUSD", A.musd);
  await (await musd.connect(whale).transfer(addr, musdAmount)).wait();
  console.log(`[fork] funded ${addr} with ${ethers.formatEther(musdAmount)} MUSD`);
}

module.exports = { fundIfFork };
