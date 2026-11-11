// TenorQuoter against a real Mezo CL pool on a local copy of Mezo testnet.
// Every quote must equal what TenorRouter then does, to the wei.
//   npm run test:fork
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, setBalance, impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");
const A = require("../scripts/lib/addresses")[31611];
const { createAndSeed } = require("../scripts/lib/clpool");

const E = (n) => ethers.parseEther(String(n));
// Same price bounds as the app (app/src/hooks/useQuote.js).
const limitAt = (ptPrice, ptIs0) => BigInt(Math.floor(Math.sqrt(ptIs0 ? ptPrice : 1 / ptPrice) * 2 ** 52)) << 44n;

(process.env.FORK === "testnet" ? describe : describe.skip)("TenorQuoter on forked Mezo testnet", function () {
  let musd, market, router, quoter, pool, poolC, pt, yt, alice, lp, ptIs0, UP, DOWN;

  before(async () => {
    [alice, lp] = await ethers.getSigners();
    musd = await ethers.getContractAt("MockMUSD", A.musd);
    await impersonateAccount(A.smusdStrategy);
    await setBalance(A.smusdStrategy, E(10));
    const whale = await ethers.getSigner(A.smusdStrategy);
    for (const u of [alice, lp]) await musd.connect(whale).transfer(u.address, E(5_000));

    const maturity = (await time.latest()) + 52 * 24 * 3600;
    market = await (await ethers.getContractFactory("TenorMarket")).deploy(A.smusd, maturity, lp.address, 500, "QUOTE");
    router = await (await ethers.getContractFactory("TenorRouter")).deploy(A.clFactory);
    quoter = await (await ethers.getContractFactory("TenorQuoter")).deploy();
    pt = await ethers.getContractAt("TenorToken", await market.pt());
    yt = await ethers.getContractAt("TenorToken", await market.yt());

    await musd.connect(lp).approve(await market.getAddress(), ethers.MaxUint256);
    await market.connect(lp).deposit(E(1_000), lp.address);
    const seeded = await createAndSeed({
      signer: lp, A, market, apy: 0.12, lowPt: 0.95, highPt: 1.0005, ptAmount: E(1_000), musdAmount: E(1_000),
    });
    pool = seeded.pool;
    ptIs0 = seeded.ptIs0;
    poolC = await ethers.getContractAt(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,bool)"], pool);
    UP = limitAt(1.01, ptIs0);
    DOWN = limitAt(0.8, ptIs0);

    await musd.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
    await musd.connect(alice).approve(await market.getAddress(), ethers.MaxUint256);
    await pt.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
    await yt.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
  });

  const price = async () => (await poolC.slot0())[0];

  it("quoteBuyPT equals the PT that buyPT delivers, and the price after", async () => {
    const q = await quoter.quoteBuyPT.staticCall(pool, pt, E(50), UP);
    expect(q.filled).to.equal(true);
    expect(q.amountIn).to.equal(E(50));
    const before = await pt.balanceOf(alice.address);
    await router.connect(alice).buyPT(market, pool, E(50), q.amountOut, alice.address);
    expect((await pt.balanceOf(alice.address)) - before).to.equal(q.amountOut);
    expect(await price()).to.equal(q.sqrtPriceAfterX96);
  });

  it("quoteSellPT equals the MUSD that sellPT pays", async () => {
    const q = await quoter.quoteSellPT.staticCall(pool, pt, E(20), DOWN);
    expect(q.filled).to.equal(true);
    const before = await musd.balanceOf(alice.address);
    await router.connect(alice).sellPT(market, pool, E(20), q.amountOut, alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.equal(q.amountOut);
    expect(await price()).to.equal(q.sqrtPriceAfterX96);
  });

  it("quoteExactPT gives the cost of sellYT: YT amount minus MUSD paid for the PT", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    const q = await quoter.quoteExactPT.staticCall(pool, pt, E(100), UP);
    expect(q.filled).to.equal(true);
    expect(q.amountOut).to.equal(E(100));
    const before = await musd.balanceOf(alice.address);
    await router.connect(alice).sellYT(market, pool, E(100), E(100) - q.amountIn, alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.equal(E(100) - q.amountIn);
  });

  it("quotes agree with the router's own static call", async () => {
    const q = await quoter.quoteBuyPT.staticCall(pool, pt, E(123.456), UP);
    const out = await router.connect(alice).buyPT.staticCall(market, pool, E(123.456), 0, alice.address);
    expect(q.amountOut).to.equal(out);
  });

  it("reports a partial fill instead of hiding it", async () => {
    const q = await quoter.quoteBuyPT.staticCall(pool, pt, E(1_000_000), UP);
    expect(q.filled).to.equal(false);
    expect(q.amountIn).to.be.lt(E(1_000_000));
    expect(q.amountIn).to.be.gt(0);
  });

  it("never moves funds or the pool price", async () => {
    const p = await price();
    const bal = await musd.balanceOf(pool);
    await quoter.quoteBuyPT.staticCall(pool, pt, E(500), UP);
    await quoter.quoteSellPT.staticCall(pool, pt, E(500), DOWN);
    expect(await price()).to.equal(p);
    expect(await musd.balanceOf(pool)).to.equal(bal);
    // Even sent as a real transaction, the swap inside is always reverted, so nothing changes.
    await expect(quoter.quoteBuyPT(pool, pt, E(1), UP)).to.not.be.reverted;
    expect(await price()).to.equal(p);
    expect(await musd.balanceOf(await quoter.getAddress())).to.equal(0);
    expect(await pt.balanceOf(await quoter.getAddress())).to.equal(0);
  });

  it("rejects callbacks from anything but a pool mid-swap", async () => {
    await expect(quoter.uniswapV3SwapCallback(1, 1, "0x")).to.be.reverted;
  });
});
