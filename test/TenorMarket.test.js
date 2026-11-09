const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const E = (n) => ethers.parseEther(String(n));
const WEEK = 7 * 24 * 3600;

describe("TenorMarket (unit, mock sMUSD)", function () {
  let musd, smusd, market, pt, yt, owner, alice, bob, carol, treasury, maturity;

  beforeEach(async () => {
    [owner, alice, bob, carol, treasury] = await ethers.getSigners();
    musd = await (await ethers.getContractFactory("MockMUSD")).deploy();
    smusd = await (await ethers.getContractFactory("MockSMUSD")).deploy(await musd.getAddress());
    maturity = (await time.latest()) + 6 * WEEK;
    market = await (await ethers.getContractFactory("TenorMarket")).deploy(
      await smusd.getAddress(), maturity, treasury.address, 500, "TEST"
    );
    pt = await ethers.getContractAt("TenorToken", await market.pt());
    yt = await ethers.getContractAt("TenorToken", await market.yt());
    for (const u of [owner, alice, bob, carol]) {
      await musd.mint(u.address, E(1_000_000));
      await musd.connect(u).approve(await market.getAddress(), ethers.MaxUint256);
      await musd.connect(u).approve(await smusd.getAddress(), ethers.MaxUint256);
    }
  });

  // Owner simulates Mezo protocol fees flowing into sMUSD.
  const payYield = (amt) => smusd.connect(owner).receiveProtocolYield(E(amt));

  async function invariants() {
    expect(await smusd.balanceOf(await market.getAddress())).to.equal(await pt.totalSupply());
  }

  it("rejects bad config", async () => {
    const F = await ethers.getContractFactory("TenorMarket");
    const s = await smusd.getAddress();
    await expect(F.deploy(s, maturity, treasury.address, 1001, "X")).to.be.revertedWithCustomError(F, "BadConfig");
    await expect(F.deploy(s, (await time.latest()) - 1, treasury.address, 0, "X")).to.be.revertedWithCustomError(F, "BadConfig");
    await expect(F.deploy(s, maturity, ethers.ZeroAddress, 0, "X")).to.be.revertedWithCustomError(F, "BadConfig");
  });

  it("deposit mints PT and YT 1:1, fully backed by sMUSD", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    expect(await pt.balanceOf(alice.address)).to.equal(E(100));
    expect(await yt.balanceOf(alice.address)).to.equal(E(100));
    expect(await pt.symbol()).to.equal("PT-sMUSD-TEST");
    await invariants();
  });

  it("distributes sMUSD yield to YT holders pro-rata, minus 5% fee", async () => {
    await market.connect(alice).deposit(E(300), alice.address);
    await market.connect(bob).deposit(E(100), bob.address);
    // Market is the only sMUSD holder, so it gets all 40 MUSD of yield.
    await payYield(40);
    expect(await market.previewYield(alice.address)).to.equal(E(28.5)); // 30 * 0.95
    const a0 = await musd.balanceOf(alice.address);
    await market.connect(alice).claimYield(alice.address);
    expect((await musd.balanceOf(alice.address)) - a0).to.equal(E(28.5));
    const b0 = await musd.balanceOf(bob.address);
    await market.connect(bob).claimYield(bob.address);
    expect((await musd.balanceOf(bob.address)) - b0).to.equal(E(9.5));
    expect(await market.treasuryAccrued()).to.equal(E(2));
  });

  it("YT transfer keeps earned yield with the sender", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    await payYield(10);
    await yt.connect(alice).transfer(bob.address, E(100));
    await payYield(10);
    // alice earned the first 10 (9.5 net), bob the second.
    expect(await market.previewYield(alice.address)).to.equal(E(9.5));
    expect(await market.previewYield(bob.address)).to.equal(E(9.5));
  });

  it("late depositor does not capture earlier yield, even yield released by their own deposit", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    await payYield(10);
    await smusd.connect(owner).queueFee(E(10)); // released inside bob's sMUSD.deposit
    await market.connect(bob).deposit(E(100), bob.address);
    expect(await market.previewYield(alice.address)).to.equal(E(19)); // 20 * 0.95
    expect(await market.previewYield(bob.address)).to.equal(0);
    await invariants();
  });

  it("redeemPair returns principal; accrued yield stays claimable", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    await payYield(10);
    const a0 = await musd.balanceOf(alice.address);
    await market.connect(alice).redeemPair(E(100), alice.address);
    expect((await musd.balanceOf(alice.address)) - a0).to.equal(E(100));
    expect(await pt.balanceOf(alice.address)).to.equal(0);
    expect(await market.previewYield(alice.address)).to.equal(E(9.5));
    await market.connect(alice).claimYield(alice.address);
    expect(await market.previewYield(alice.address)).to.equal(0);
    await invariants();
  });

  it("yield auto-paid by sMUSD.withdraw is distributed, not lost", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    await market.connect(bob).deposit(E(100), bob.address);
    await smusd.connect(owner).queueFee(E(20)); // released inside sMUSD.withdraw
    await market.connect(bob).redeemPair(E(50), bob.address);
    expect(await market.previewYield(alice.address)).to.equal(E(9.5));
    expect(await market.previewYield(bob.address)).to.equal(E(9.5));
    await invariants();
  });

  it("PT redeems 1:1 only after maturity; deposits close at maturity", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    await expect(market.connect(alice).redeemPT(E(100), alice.address)).to.be.revertedWithCustomError(market, "NotMatured");
    await time.increaseTo(maturity);
    await expect(market.connect(bob).deposit(E(1), bob.address)).to.be.revertedWithCustomError(market, "Matured");
    const a0 = await musd.balanceOf(alice.address);
    await market.connect(alice).redeemPT(E(100), alice.address);
    expect((await musd.balanceOf(alice.address)) - a0).to.equal(E(100));
    await invariants();
  });

  it("yield harvested after maturity goes to the treasury, not YT", async () => {
    await market.connect(alice).deposit(E(100), alice.address);
    await payYield(10);
    await market.harvest(); // keeper harvests before maturity
    await time.increaseTo(maturity);
    await payYield(10);
    await market.harvest();
    expect(await market.previewYield(alice.address)).to.equal(E(9.5));
    expect(await market.treasuryAccrued()).to.equal(E(10.5));
    await market.claimTreasury();
    expect(await musd.balanceOf(treasury.address)).to.equal(E(10.5));
  });

  it("stays solvent through a full lifecycle with many users", async () => {
    const users = [alice, bob, carol];
    for (const [i, u] of users.entries()) await market.connect(u).deposit(E(100 * (i + 1)), u.address);
    await payYield(7);
    await yt.connect(carol).transfer(alice.address, E(123));
    await smusd.connect(owner).queueFee(E(3));
    await market.connect(bob).redeemPair(E(50), bob.address);
    await payYield(11);
    await pt.connect(alice).transfer(bob.address, E(10));
    await time.increaseTo(maturity);
    for (const u of users) {
      await market.connect(u).claimYield(u.address);
      const bal = await pt.balanceOf(u.address);
      if (bal > 0n) await market.connect(u).redeemPT(bal, u.address);
    }
    await market.claimTreasury();
    expect(await pt.totalSupply()).to.equal(0);
    expect(await smusd.balanceOf(await market.getAddress())).to.equal(0);
    // Only rounding dust may remain.
    expect(await musd.balanceOf(await market.getAddress())).to.be.lt(1000n);
  });

  it("only YT can call the transfer hook; only market can mint", async () => {
    await expect(market.onYTTransfer(alice.address, bob.address)).to.be.revertedWithCustomError(market, "OnlyYT");
    await expect(pt.mint(alice.address, 1)).to.be.revertedWithCustomError(pt, "OnlyMarket");
  });

  it("rejects zero amounts", async () => {
    await expect(market.deposit(0, alice.address)).to.be.revertedWithCustomError(market, "ZeroAmount");
    await expect(market.redeemPair(0, alice.address)).to.be.revertedWithCustomError(market, "ZeroAmount");
  });
});
