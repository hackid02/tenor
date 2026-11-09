// Runs against a local copy of Mezo testnet: real sMUSD, real Mezo Pools.
//   FORK=testnet npx hardhat test test/fork.test.js
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time, setBalance, impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");
const A = require("../scripts/lib/addresses")[31611];
const { musdNeededForPT, impliedApy } = require("../scripts/lib/quote");

const E = (n) => ethers.parseEther(String(n));
const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getAmountOut(uint256,address) view returns (uint256)",
  "function getReserves() view returns (uint256,uint256,uint256)",
  "function mint(address) returns (uint256)",
];
const FACTORY_ABI = [
  "function createPool(address,address,bool) returns (address)",
  "function getPool(address,address,bool) view returns (address)",
];

(process.env.FORK === "testnet" ? describe : describe.skip)("Tenor on forked Mezo testnet", function () {
  let musd, smusd, market, router, pool, pt, yt, alice, bob, lp, whale, maturity;

  before(async () => {
    [alice, bob, lp] = await ethers.getSigners();
    musd = await ethers.getContractAt("MockMUSD", A.musd); // ERC20 ABI is enough
    smusd = await ethers.getContractAt("ISMUSD", A.smusd);

    // Borrow test MUSD from the sMUSD strategy on the fork only.
    await impersonateAccount(A.smusdStrategy);
    await setBalance(A.smusdStrategy, E(10));
    whale = await ethers.getSigner(A.smusdStrategy);
    for (const u of [alice, bob, lp]) await musd.connect(whale).transfer(u.address, E(5_000));

    maturity = (await time.latest()) + 42 * 24 * 3600;
    market = await (await ethers.getContractFactory("TenorMarket")).deploy(A.smusd, maturity, lp.address, 500, "FORK");
    router = await (await ethers.getContractFactory("TenorRouter")).deploy();
    pt = await ethers.getContractAt("TenorToken", await market.pt());
    yt = await ethers.getContractAt("TenorToken", await market.yt());

    // Create the PT/MUSD stable pool on Mezo Pools and seed it.
    const factory = new ethers.Contract(A.poolFactory, FACTORY_ABI, lp);
    await (await factory.createPool(A.musd, await pt.getAddress(), true)).wait();
    pool = new ethers.Contract(await factory.getPool(A.musd, await pt.getAddress(), true), POOL_ABI, lp);
    await musd.connect(lp).approve(await market.getAddress(), ethers.MaxUint256);
    await market.connect(lp).deposit(E(1_200), lp.address);
    // Stable pools must be seeded 1:1, then priced by selling PT into them.
    await pt.connect(lp).transfer(await pool.getAddress(), E(1_000));
    await musd.connect(lp).transfer(await pool.getAddress(), E(1_000));
    await (await pool.mint(lp.address)).wait();
    await pt.connect(lp).approve(await router.getAddress(), ethers.MaxUint256);
    await router.connect(lp).sellPT(market, pool, E(190), 0, lp.address); // ~1.4% PT discount

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

  it("buyPT: Fix my yield at a positive fixed APY", async () => {
    const out = await router.connect(alice).buyPT.staticCall(market, pool, E(100), 0, alice.address);
    await router.connect(alice).buyPT(market, pool, E(100), out, alice.address);
    expect(await pt.balanceOf(alice.address)).to.equal(out);
    expect(out).to.be.gt(E(100));
    const apy = impliedApy(E(100), out, maturity - (await time.latest()));
    console.log(`      fixed APY locked: ${(apy * 100).toFixed(2)}%`);
    expect(apy).to.be.gt(0.05);
  });

  it("sellPT: exit a fixed position early", async () => {
    const before = await musd.balanceOf(alice.address);
    await router.connect(alice).sellPT(market, pool, E(50), 0, alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.be.gt(E(49));
  });

  it("cashOutYield: keep PT, get future yield in MUSD now", async () => {
    const amount = E(100);
    const cost = await musdNeededForPT(pool, A.musd, amount);
    const before = await musd.balanceOf(bob.address);
    await router.connect(bob).cashOutYield(market, pool, amount, cost, 0, bob.address);
    const upfront = (await musd.balanceOf(bob.address)) - (before - amount);
    console.log(`      100 MUSD -> 100 PT + ${ethers.formatEther(upfront)} MUSD upfront`);
    expect(await pt.balanceOf(bob.address)).to.equal(amount);
    expect(await yt.balanceOf(bob.address)).to.equal(0);
    expect(upfront).to.be.gt(0); // size depends on pool depth
    expect(await musd.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("refuses to sell YT when the pool is too thin for PT to stay below 1 MUSD", async () => {
    const cost = await musdNeededForPT(pool, A.musd, E(900));
    await expect(
      router.connect(bob).cashOutYield(market, pool, E(900), cost, 0, bob.address)
    ).to.be.revertedWithCustomError(router, "Slippage");
  });

  it("buyYT then sellYT round-trips through the pool", async () => {
    const before = await musd.balanceOf(alice.address);
    await router.connect(alice).buyYT(market, pool, E(200), E(200), alice.address);
    expect(await yt.balanceOf(alice.address)).to.equal(E(200));
    const paid = before - (await musd.balanceOf(alice.address));
    console.log(`      200 YT cost ${ethers.formatEther(paid)} MUSD`);
    expect(paid).to.be.lt(E(10));

    const cost = await musdNeededForPT(pool, A.musd, E(200));
    await router.connect(alice).sellYT(market, pool, E(200), cost, 0, alice.address);
    expect(await yt.balanceOf(alice.address)).to.equal(0);
  });

  it("YT earns real sMUSD yield", async () => {
    await market.connect(alice).deposit(E(1_000), alice.address);
    // Simulate Mezo protocol fees landing in sMUSD (anyone can push yield).
    await musd.connect(whale).approve(A.smusd, E(1_000));
    await (await ethers.getContractAt(["function receiveProtocolYield(uint256)"], A.smusd)).connect(whale).receiveProtocolYield(E(1_000));
    const y = await market.previewYield(alice.address);
    expect(y).to.be.gt(0);
    const before = await musd.balanceOf(alice.address);
    await market.connect(alice).claimYield(alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.be.gte(y);
  });

  it("rejects callbacks not started by the router", async () => {
    await expect(router.hook(router, 0, 0, "0x")).to.be.revertedWithCustomError(router, "UnauthorizedCallback");
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
