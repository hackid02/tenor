// Team QA on Mezo Testnet: fresh wallets act out real user journeys and
// edge cases against the live contracts, with pass/fail checks.
//
//   npx hardhat run scripts/qa-personas.js --network mezoTestnet
//
// These wallets are funded and controlled by the Tenor team. They are QA,
// not users: every address is written to qa/wallets.json and labelled
// "Team QA" in the app, PROOF.md and docs/QA.md.
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const ADDR = require("./lib/addresses");
const D = require("./lib/deployments");
const cl = require("./lib/cl");

const E = (n) => ethers.parseEther(String(n));
const G = { gasLimit: 1_000_000 }; // gas floor: Mezo RPC estimates can be far too low
const F = (x, d = 4) => Number(ethers.formatEther(x)).toFixed(d);
const root = path.join(__dirname, "..");

async function main() {
  const [funder] = await ethers.getSigners();
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const A = ADDR[cid];
  const dep = D.load(cid);
  const m = dep.markets.main;
  const ex = (h) => `${A.explorer}/tx/${h}`;

  const musdF = await ethers.getContractAt("MockMUSD", A.musd, funder);
  const q = await ethers.getContractAt("TenorQuoter", dep.quoter);
  const pool = new ethers.Contract(m.pool, cl.CL_POOL_ABI, ethers.provider);
  const ptIs0 = (await pool.token0()).toLowerCase() === m.pt.toLowerCase();
  const UP = cl.sqrtX96(cl.poolPriceFromPt(1.01, ptIs0));
  const DOWN = cl.sqrtX96(cl.poolPriceFromPt(0.8, ptIs0));
  const secsLeft = async () => m.maturity - (await ethers.provider.getBlock("latest")).timestamp;

  const results = [];
  const wallets = {};
  const log = (persona, check, pass, detail, tx) => {
    results.push({ persona, check, pass, detail, tx: tx ? ex(tx) : null });
    console.log(`${pass ? "PASS" : "FAIL"}  [${persona}] ${check}${detail ? ` | ${detail}` : ""}${tx ? `\n      ${ex(tx)}` : ""}`);
  };
  const send = async (p) => (await p).wait();

  // Retries transient RPC errors (Mezo's public testnet RPC times out at times).
  async function retry(fn, tries = 4) {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        const msg = String(e.shortMessage || e.message);
        if (i >= tries - 1 || !/timeout|ECONNRESET|socket|could not coalesce|503|502/i.test(msg)) throw e;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  // A reverting call should revert with the named custom error.
  async function expectRevert(persona, check, fn, errName) {
    try {
      await fn();
      log(persona, check, false, "expected a revert, but it succeeded");
    } catch (e) {
      const data = e.data || e.info?.error?.data || e.error?.data;
      let name = e.revert?.name || "";
      if (!name && typeof data === "string") {
        for (const c of [ethers.getContractAt("TenorRouter", dep.router), ethers.getContractAt("TenorMarket", m.market), ethers.getContractAt("TenorToken", m.pt)]) {
          try {
            name = (await c).interface.parseError(data)?.name || name;
          } catch {}
        }
      }
      const ok = errName ? name === errName : true;
      log(persona, check, ok, `reverted${name ? ` with ${name}` : ""}${errName && !ok ? ` (expected ${errName})` : ""}`);
    }
  }

  async function makePersona(name, musd) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    wallets[name] = w.address;
    await retry(() => send(funder.sendTransaction({ to: w.address, value: E("0.0002") })));
    if (musd > 0) await retry(() => send(musdF.transfer(w.address, E(musd))));
    const c = {
      w,
      musd: await ethers.getContractAt("MockMUSD", A.musd, w),
      pt: await ethers.getContractAt("TenorToken", m.pt, w),
      yt: await ethers.getContractAt("TenorToken", m.yt, w),
      market: await ethers.getContractAt("TenorMarket", m.market, w),
      router: await ethers.getContractAt("TenorRouter", dep.router, w),
    };
    console.log(`\n== ${name}: ${w.address} (funded ${musd} MUSD)`);
    return c;
  }
  const approveAll = async (p) => {
    for (const [tok, sp] of [[p.musd, dep.router], [p.musd, m.market], [p.pt, dep.router], [p.yt, dep.router]]) {
      await retry(() => send(tok.approve(sp, ethers.MaxUint256)));
    }
  };
  const near = (a, b, bps = 1) => (a > b ? a - b : b - a) * 10000n <= b * BigInt(bps);

  // ---------------- Ada, the saver ----------------
  {
    const p = await makePersona("Ada (saver)", 60);
    await approveAll(p);
    const quote = await q.quoteBuyPT.staticCall(m.pool, m.pt, E(50), UP);
    const rc = await retry(() => send(p.router.buyPT(m.market, m.pool, E(50), (quote.amountOut * 995n) / 1000n, p.w.address, G)));
    const pt = await p.pt.balanceOf(p.w.address);
    const apy = Math.pow(Number(pt) / Number(E(50)), (365 * 86400) / (await secsLeft())) - 1;
    log("Ada", "Fix my yield: 50 MUSD gets the quoted PT", near(pt, quote.amountOut, 1), `quoted ${F(quote.amountOut)} PT, got ${F(pt)} PT, ${(apy * 100).toFixed(2)}% fixed`, rc.hash);
    log("Ada", "Holding PT, no MUSD stuck in router", (await p.musd.balanceOf(dep.router)) === 0n, "router MUSD balance 0");
  }

  // ---------------- Bayo, the yield seller ----------------
  {
    const p = await makePersona("Bayo (yield seller)", 110);
    await approveAll(p);
    const quote = await q.quoteExactPT.staticCall(m.pool, m.pt, E(100), UP);
    const upfront = E(100) - quote.amountIn;
    const before = await p.musd.balanceOf(p.w.address);
    const rc = await retry(() => send(p.router.cashOutYield(m.market, m.pool, E(100), (upfront * 98n) / 100n, p.w.address, G)));
    const after = await p.musd.balanceOf(p.w.address);
    const got = after - (before - E(100));
    log("Bayo", "Sell future yield on 100 MUSD: keeps 100 PT", (await p.pt.balanceOf(p.w.address)) === E(100), `PT ${F(await p.pt.balanceOf(p.w.address), 2)}`, rc.hash);
    log("Bayo", "Gets about the quoted MUSD up front", near(got, upfront, 50), `quoted ${F(upfront)}, got ${F(got)} MUSD`);
    log("Bayo", "Has no YT left (yield sold)", (await p.yt.balanceOf(p.w.address)) === 0n, "YT 0");
  }

  // ---------------- Chidi, the YT speculator ----------------
  {
    const p = await makePersona("Chidi (YT trader)", 20);
    await approveAll(p);
    const sell = await q.quoteSellPT.staticCall(m.pool, m.pt, E(30), DOWN);
    const cost = E(30) - sell.amountOut;
    const before = await p.musd.balanceOf(p.w.address);
    const rc1 = await retry(() => send(p.router.buyYT(m.market, m.pool, E(30), (cost * 102n) / 100n, p.w.address, G)));
    const paid = before - (await p.musd.balanceOf(p.w.address));
    log("Chidi", "Buy 30 YT for about the quoted cost", (await p.yt.balanceOf(p.w.address)) === E(30) && near(paid, cost, 100), `quoted ${F(cost)}, paid ${F(paid)} MUSD for 30 YT`, rc1.hash);
    const rc2 = await retry(() => send(p.market.claimYield(p.w.address, G)));
    log("Chidi", "Claim yield works with nothing accrued yet", rc2.status === 1, "claimed 0, no revert", rc2.hash);
    const sq = await q.quoteExactPT.staticCall(m.pool, m.pt, E(10), UP);
    const out = E(10) - sq.amountIn;
    const b2 = await p.musd.balanceOf(p.w.address);
    const rc3 = await retry(() => send(p.router.sellYT(m.market, m.pool, E(10), (out * 98n) / 100n, p.w.address, G)));
    const got = (await p.musd.balanceOf(p.w.address)) - b2;
    log("Chidi", "Sell 10 YT back for about the quoted MUSD", (await p.yt.balanceOf(p.w.address)) === E(20) && near(got, out, 200), `quoted ${F(out)}, got ${F(got)} MUSD, 20 YT left`, rc3.hash);
  }

  // ---------------- Dami, the early exiter ----------------
  {
    const p = await makePersona("Dami (early exit)", 40);
    await approveAll(p);
    const qb = await q.quoteBuyPT.staticCall(m.pool, m.pt, E(30), UP);
    const rc1 = await retry(() => send(p.router.buyPT(m.market, m.pool, E(30), (qb.amountOut * 995n) / 1000n, p.w.address, G)));
    const pt = await p.pt.balanceOf(p.w.address);
    const qs = await q.quoteSellPT.staticCall(m.pool, m.pt, pt, DOWN);
    const b = await p.musd.balanceOf(p.w.address);
    const rc2 = await retry(() => send(p.router.sellPT(m.market, m.pool, pt, (qs.amountOut * 995n) / 1000n, p.w.address, G)));
    const back = (await p.musd.balanceOf(p.w.address)) - b;
    const lossBps = Number(((E(30) - back) * 10000n) / E(30));
    log("Dami", "Buy 30 MUSD of PT, then sell it all straight back", (await p.pt.balanceOf(p.w.address)) === 0n, `got back ${F(back)} of 30 MUSD (round-trip cost ${(lossBps / 100).toFixed(2)}%)`, rc2.hash);
    log("Dami", "Round trip costs under 0.5% (fees and price impact)", lossBps < 50, `${(lossBps / 100).toFixed(2)}%`);
    void rc1;
  }

  // ---------------- Efe, the hands-on user ----------------
  {
    const p = await makePersona("Efe (split and merge)", 20);
    await approveAll(p);
    const rc1 = await retry(() => send(p.market.deposit(E(20), p.w.address, G)));
    log("Efe", "Split 20 MUSD into 20 PT + 20 YT", (await p.pt.balanceOf(p.w.address)) === E(20) && (await p.yt.balanceOf(p.w.address)) === E(20), "20 PT + 20 YT", rc1.hash);
    const rc2 = await retry(() => send(p.yt.transfer(wallets["Ada (saver)"], E(5), G)));
    log("Efe", "Send 5 YT to Ada (yield checkpoint on transfer)", (await p.yt.balanceOf(p.w.address)) === E(15), "15 YT left", rc2.hash);
    const b = await p.musd.balanceOf(p.w.address);
    const rc3 = await retry(() => send(p.market.redeemPair(E(10), p.w.address, G)));
    const back = (await p.musd.balanceOf(p.w.address)) - b;
    log("Efe", "Merge 10 PT + 10 YT back into exactly 10 MUSD", back === E(10), `${F(back)} MUSD`, rc3.hash);
    const mk = await ethers.getContractAt("TenorMarket", m.market);
    const sm = await ethers.getContractAt("ISMUSD", A.smusd);
    const ptS = await (await ethers.getContractAt("TenorToken", m.pt)).totalSupply();
    log("Efe", "Invariant: market's sMUSD equals PT supply", (await sm.balanceOf(m.market)) === ptS, `${F(ptS, 2)} PT = ${F(await sm.balanceOf(m.market), 2)} sMUSD`);
    void mk;
  }

  // ---------------- Funmi, the troublemaker ----------------
  {
    const p = await makePersona("Funmi (edge cases)", 5);
    await expectRevert("Funmi", "Fix yield without approving MUSD", () => p.router.buyPT.staticCall(m.market, m.pool, E(1), 0, p.w.address), "ERC20InsufficientAllowance");
    await approveAll(p);
    await expectRevert("Funmi", "Fix yield with more MUSD than she has", () => p.router.buyPT.staticCall(m.market, m.pool, E(50), 0, p.w.address), "ERC20InsufficientBalance");
    await expectRevert("Funmi", "Impossible minimum (slippage guard)", () => p.router.buyPT.staticCall(m.market, m.pool, E(1), E(2), p.w.address), "Slippage");
    await expectRevert("Funmi", "Sell PT she doesn't have", () => p.router.sellPT.staticCall(m.market, m.pool, E(1), 0, p.w.address), "ERC20InsufficientBalance");
    await expectRevert("Funmi", "Zero amount", () => p.router.buyPT.staticCall(m.market, m.pool, 0, 0, p.w.address), "ZeroAmount");
    await expectRevert("Funmi", "Pass a fake pool", () => p.router.buyPT.staticCall(m.market, A.musd, E(1), 0, p.w.address));
    await expectRevert("Funmi", "Redeem PT before maturity", () => p.market.redeemPT.staticCall(E(1), p.w.address), "NotMatured");
    await expectRevert("Funmi", "Call the swap callback directly", () => p.router.uniswapV3SwapCallback.staticCall(1, 1, "0x"), "UnauthorizedCallback");
    const big = await q.quoteBuyPT.staticCall(m.pool, m.pt, E(100000), UP);
    log("Funmi", "Quote for 100,000 MUSD reports a partial fill (app shows the limit)", !big.filled, `pool can take ${F(big.amountIn, 2)} MUSD`);
  }

  // ---------------- Save ----------------
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  const walletsFile = path.join(root, "qa", "wallets.json");
  const prev = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
  fs.writeFileSync(walletsFile, JSON.stringify({ ...prev, ...Object.fromEntries(Object.entries(wallets).map(([k, v]) => [v, k])) }, null, 2) + "\n");
  const run = { time: new Date().toISOString(), network: A.name, results };
  fs.writeFileSync(path.join(root, "qa", "last-run.json"), JSON.stringify(run, null, 2) + "\n");
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
