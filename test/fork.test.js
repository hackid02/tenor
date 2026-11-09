// Runs against a local copy of Mezo testnet: real sMUSD, real Mezo CL pools.
//   npm run test:fork
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, setBalance, impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");
const A = require("../scripts/lib/addresses")[31611];
const { createAndSeed, poolState } = require("../scripts/lib/clpool");

const E = (n) => ethers.parseEther(String(n));
const F = (x) => Number(ethers.formatEther(x)).toFixed(4);
const pct = (x) => (x * 100).toFixed(2) + "%";

(process.env.FORK === "testnet" ? describe : describe.skip)("Tenor on forked Mezo testnet (CL pool)", function () {
  let musd, smusd, market, router, pool, pt, yt, alice, bob, lp, whale, maturity;

  before(async () => {
    [alice, bob, lp] = await ethers.getSigners();
    musd = await ethers.getContractAt("MockMUSD", A.musd);
    smusd = await ethers.getContractAt("ISMUSD", A.smusd);

    await impersonateAccount(A.smusdStrategy);
    await setBalance(A.smusdStrategy, E(10));
    whale = await ethers.getSigner(A.smusdStrategy);
    for (const u of [alice, bob, lp]) await musd.connect(whale).transfer(u.address, E(5_000));

    maturity = (await time.latest()) + 52 * 24 * 3600;
    market = await (await ethers.getContractFactory("TenorMarket")).deploy(A.smusd, maturity, lp.address, 500, "FORK");
    router = await (await ethers.getContractFactory("TenorRouter")).deploy(A.clFactory);
    pt = await ethers.getContractAt("TenorToken", await market.pt());
    yt = await ethers.getContractAt("TenorToken", await market.yt());

    // Same liquidity as the stable pool that failed: ~1,000 PT + 1,000 MUSD.
    await musd.connect(lp).approve(await market.getAddress(), ethers.MaxUint256);
    await market.connect(lp).deposit(E(1_000), lp.address);
    const seeded = await createAndSeed({
      signer: lp, A, market, apy: 0.12, lowPt: 0.95, highPt: 1.0005, ptAmount: E(1_000), musdAmount: E(1_000),
    });
    pool = seeded.pool;
    console.log(`      pool opened at ${pct(seeded.apy)} fixed APY, PT price ${seeded.ptPrice.toFixed(5)}`);

    for (const u of [alice, bob]) {
      await musd.connect(u).approve(await router.getAddress(), ethers.MaxUint256);
      await musd.connect(u).approve(await market.getAddress(), ethers.MaxUint256);
      await pt.connect(u).approve(await router.getAddress(), ethers.MaxUint256);
      await yt.connect(u).approve(await router.getAddress(), ethers.MaxUint256);
    }
  });

  it("uses the real sMUSD: market holds sMUSD 1:1 with PT", async () => {
    expect(await smusd.balanceOf(await market.getAddress())).to.equal(await pt.totalSupply());
  });

  it("buyPT: 50 MUSD keeps close to the quoted fixed APY", async () => {
    const before = await poolState(pool, await pt.getAddress(), maturity);
    const out = await router.connect(alice).buyPT.staticCall(market, pool, E(50), 0, alice.address);
    await router.connect(alice).buyPT(market, pool, E(50), out, alice.address);
    const secs = maturity - (await time.latest());
    const locked = Math.pow(Number(out) / Number(E(50)), (365 * 24 * 3600) / secs) - 1;
    const after = await poolState(pool, await pt.getAddress(), maturity);
    console.log(`      spot ${pct(before.apy)} -> locked ${pct(locked)} -> spot after ${pct(after.apy)}`);
    expect(await pt.balanceOf(alice.address)).to.equal(out);
    expect(locked).to.be.gt(before.apy - 0.01); // under 1 point of slippage
  });

  it("sellPT: exit a fixed position early", async () => {
    const before = await musd.balanceOf(alice.address);
    await router.connect(alice).sellPT(market, pool, E(20), 0, alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.be.gt(E(19.5));
  });

  it("cashOutYield: keep PT, get about the fair value of future yield now", async () => {
    const st = await poolState(pool, await pt.getAddress(), maturity);
    const fair = 100 * (1 - st.ptPrice);
    const out = await router.connect(bob).cashOutYield.staticCall(market, pool, E(100), 0, bob.address);
    await router.connect(bob).cashOutYield(market, pool, E(100), out, bob.address);
    console.log(`      100 MUSD -> 100 PT + ${F(out)} MUSD now (fair ~${fair.toFixed(4)})`);
    expect(await pt.balanceOf(bob.address)).to.equal(E(100));
    expect(await yt.balanceOf(bob.address)).to.equal(0);
    expect(Number(ethers.formatEther(out))).to.be.gt(fair * 0.8);
    expect(await musd.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("buyYT then sellYT round-trips", async () => {
    const before = await musd.balanceOf(alice.address);
    const cost = await router.connect(alice).buyYT.staticCall(market, pool, E(200), E(200), alice.address);
    await router.connect(alice).buyYT(market, pool, E(200), cost + cost / 100n, alice.address);
    expect(await yt.balanceOf(alice.address)).to.equal(E(200));
    console.log(`      200 YT cost ${F(before - (await musd.balanceOf(alice.address)))} MUSD`);
    await router.connect(alice).sellYT(market, pool, E(200), 0, alice.address);
    expect(await yt.balanceOf(alice.address)).to.equal(0);
    expect(await pt.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("buyYT respects the max price", async () => {
    await expect(router.connect(alice).buyYT(market, pool, E(200), E(0.01), alice.address))
      .to.be.revertedWithCustomError(router, "Slippage");
  });

  it("rejects pools that are not Mezo's CL pool for this market", async () => {
    await expect(router.connect(alice).buyPT(market, A.musd, E(1), 0, alice.address)).to.be.reverted;
    const fake = await (await ethers.getContractFactory("MockMUSD")).deploy();
    await expect(router.connect(alice).buyPT(market, await fake.getAddress(), E(1), 0, alice.address)).to.be.reverted;
  });

  it("rejects swap callbacks not started by the router", async () => {
    await expect(router.uniswapV3SwapCallback(1, 1, "0x")).to.be.revertedWithCustomError(router, "UnauthorizedCallback");
  });

  it("YT earns real sMUSD yield", async () => {
    await market.connect(alice).deposit(E(1_000), alice.address);
    await musd.connect(whale).approve(A.smusd, E(1_000));
    const s = await ethers.getContractAt(["function receiveProtocolYield(uint256)"], A.smusd);
    await s.connect(whale).receiveProtocolYield(E(1_000));
    const y = await market.previewYield(alice.address);
    expect(y).to.be.gt(0);
    const before = await musd.balanceOf(alice.address);
    await market.connect(alice).claimYield(alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.be.gte(y);
  });

  it("PT redeems 1:1 at maturity against real sMUSD", async () => {
    await time.increaseTo(maturity);
    const bal = await pt.balanceOf(bob.address);
    const before = await musd.balanceOf(bob.address);
    await market.connect(bob).redeemPT(bal, bob.address);
    expect((await musd.balanceOf(bob.address)) - before).to.equal(bal);
    expect(await smusd.balanceOf(await market.getAddress())).to.equal(await pt.totalSupply());
  });
});
