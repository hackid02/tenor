// Funds a QA wallet with test BTC (gas) and MUSD, and records it as Team QA.
//   ADDR=0x... NAME="Gina (website tester)" MUSD=20 npx hardhat run scripts/qa-fund.js --network mezoTestnet
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const A = require("./lib/addresses")[31611];
(async () => {
  const [funder] = await ethers.getSigners();
  const to = ethers.getAddress(process.env.ADDR);
  const G = { gasLimit: 200_000 };
  await (await funder.sendTransaction({ to, value: ethers.parseEther("0.0002"), ...G })).wait();
  const musd = await ethers.getContractAt("MockMUSD", A.musd, funder);
  await (await musd.transfer(to, ethers.parseEther(process.env.MUSD || "20"), G)).wait();
  const f = path.join(__dirname, "..", "qa", "wallets.json");
  const w = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  w[to] = process.env.NAME || "QA wallet";
  fs.writeFileSync(f, JSON.stringify(w, null, 2) + "\n");
  console.log(`funded ${to}: 0.0002 BTC + ${process.env.MUSD || 20} MUSD, recorded as "${w[to]}"`);
})().catch((e) => { console.error(e.shortMessage || e.message); process.exitCode = 1; });
