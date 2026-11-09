// Runs every Tenor action on a real network and records each transaction in
// proof/<chainId>.json, so anyone can check it on the explorer.
//
//   npx hardhat run scripts/prove.js --network mezoTestnet
//
// ONLY=redeemPT runs a single step (used after the demo market matures).
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const ADDR = require("./lib/addresses");
const D = require("./lib/deployments");
const { poolState } = require("./lib/clpool");

const E = (n) => ethers.parseEther(String(n));
const F = (x) => Number(ethers.formatEther(x)).toFixed(4);

async function main() {
  const [me] = await ethers.getSigners();
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const A = ADDR[cid];
  const dep = D.load(cid);
  const main = dep.markets.main;
  const demo = dep.markets.demo;

  const proofFile = path.join(__dirname, "..", "proof", `${cid}.json`);
  fs.mkdirSync(path.dirname(proofFile), { recursive: true });
  const proof = fs.existsSync(proofFile) ? JSON.parse(fs.readFileSync(proofFile, "utf8")) : { network: A.name, wallet: me.address, steps: [] };

  const musd = await ethers.getContractAt("MockMUSD", A.musd);
  const router = await ethers.getContractAt("TenorRouter", dep.router);
  const market = await ethers.getContractAt("TenorMarket", main.market);
  const pt = await ethers.getContractAt("TenorToken", main.pt);
  const yt = await ethers.getContractAt("TenorToken", main.yt);

  async function record(action, what, txPromise, details = {}) {
    const tx = await txPromise;
    const rc = await tx.wait();
    const entry = {
      action,
      what,
      tx: rc.hash,
      link: `${A.explorer}/tx/${rc.hash}`,
      block: rc.blockNumber,
      time: new Date().toISOString(),
      ...details,
    };
    proof.steps.push(entry);
    fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2) + "\n");
    console.log(`✓ ${action}: ${what}\n  ${entry.link}`);
    return rc;
  }

  const only = process.env.ONLY;
  const run = (name) => !only || only === name;

  if (run("approve")) {
    for (const [tok, spender, label] of [
      [musd, dep.router, "MUSD -> router"],
      [musd, main.market, "MUSD -> market"],
      [pt, dep.router, "PT -> router"],
      [yt, dep.router, "YT -> router"],
    ]) {
      if ((await tok.allowance(me.address, spender)) < E(1_000_000)) {
        await (await tok.approve(spender, ethers.MaxUint256)).wait();
        console.log(`approved ${label}`);
      }
    }
  }

  if (run("buyPT")) {
    const musdIn = E(50);
    const spot = await poolState(main.pool, main.pt, main.maturity);
    const out = await router.buyPT.staticCall(main.market, main.pool, musdIn, 0, me.address);
    const secs = main.maturity - Math.floor(Date.now() / 1000);
    const apy = Math.pow(Number(out) / Number(musdIn), (365 * 24 * 3600) / secs) - 1;
    await record("buyPT", `Fix my yield: 50 MUSD -> ${F(out)} PT (locks ${(apy * 100).toFixed(2)}% fixed APY; pool was at ${(spot.apy * 100).toFixed(2)}%)`,
      router.buyPT(main.market, main.pool, musdIn, (out * 995n) / 1000n, me.address),
      { musdIn: "50", ptOut: F(out), fixedApy: apy, poolApyBefore: spot.apy });
  }

  if (run("sellPT")) {
    const out = await router.sellPT.staticCall(main.market, main.pool, E(20), 0, me.address);
    await record("sellPT", `Exit early: 20 PT -> ${F(out)} MUSD`,
      router.sellPT(main.market, main.pool, E(20), (out * 995n) / 1000n, me.address));
  }

  if (run("cashOutYield")) {
    const out = await router.cashOutYield.staticCall(main.market, main.pool, E(50), 0, me.address);
    await record("cashOutYield", `Sell my future yield: 50 MUSD -> 50 PT kept + ${F(out)} MUSD now`,
      router.cashOutYield(main.market, main.pool, E(50), (out * 98n) / 100n, me.address),
      { upfrontMusd: F(out) });
  }

  if (run("buyYT")) {
    const cost = await router.buyYT.staticCall(main.market, main.pool, E(30), E(30), me.address);
    await record("buyYT", `Long yield: ${F(cost)} MUSD -> 30 YT`,
      router.buyYT(main.market, main.pool, E(30), (cost * 105n) / 100n, me.address));
  }

  if (run("sellYT")) {
    const out = await router.sellYT.staticCall(main.market, main.pool, E(30), 0, me.address);
    await record("sellYT", `Sell yield: 30 YT -> ${F(out)} MUSD`,
      router.sellYT(main.market, main.pool, E(30), (out * 98n) / 100n, me.address));
  }

  if (run("deposit")) {
    await record("deposit", "Split: 20 MUSD -> 20 PT + 20 YT (into real sMUSD)",
      market.deposit(E(20), me.address));
  }

  if (run("redeemPair")) {
    await record("redeemPair", "Merge: 10 PT + 10 YT -> 10 MUSD before maturity",
      market.redeemPair(E(10), me.address));
  }

  if (run("claimYield")) {
    const preview = await market.previewYield(me.address);
    await record("claimYield", `Claim real sMUSD yield earned by YT: ${F(preview)} MUSD`,
      market.claimYield(me.address), { yieldMusd: F(preview) });
  }

  if (run("redeemPT") && demo) {
    const dm = await ethers.getContractAt("TenorMarket", demo.market);
    const dpt = await ethers.getContractAt("TenorToken", demo.pt);
    if (!(await dm.isMatured())) {
      console.log(`- redeemPT skipped: demo market matures ${demo.maturityIso}`);
    } else {
      const bal = await dpt.balanceOf(me.address);
      await record("redeemPT", `Maturity: ${F(bal)} PT -> ${F(bal)} MUSD, 1:1`,
        dm.redeemPT(bal, me.address));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
