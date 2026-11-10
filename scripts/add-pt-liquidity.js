// Adds one-sided PT liquidity just above the current PT price on a market's
// CL pool. It acts as resting sell orders for PT, which is what "Fix my yield"
// buyers consume, and needs no MUSD.
//
//   KEY=main PT=700 npx hardhat run scripts/add-pt-liquidity.js --network mezoTestnet
const { ethers, network } = require("hardhat");
const ADDR = require("./lib/addresses");
const D = require("./lib/deployments");
const cl = require("./lib/cl");
const { TICK_SPACING } = require("./lib/clpool");

async function main() {
  const [me] = await ethers.getSigners();
  const cid = Number((await ethers.provider.getNetwork()).chainId);
  const A = ADDR[cid] || ADDR[31611];
  const dep = D.load(cid === 31337 ? 31611 : cid);
  const key = process.env.KEY || "main";
  const m = dep.markets[key];
  const amount = ethers.parseEther(process.env.PT || "700");
  const highPt = Number(process.env.HIGH || m.clPosition?.highPt || 1.0005);

  if (network.name === "hardhat") {
    // Rehearsal on a fork: act as the real wallet.
    const h = require("@nomicfoundation/hardhat-network-helpers");
    await h.impersonateAccount(m.treasury);
    await h.setBalance(m.treasury, ethers.parseEther("10"));
  }
  const signer = network.name === "hardhat" ? await ethers.getSigner(m.treasury) : me;

  const pool = new ethers.Contract(m.pool, cl.CL_POOL_ABI, signer);
  const pt = await ethers.getContractAt("TenorToken", m.pt, signer);
  const token0 = await pool.token0();
  const ptIs0 = token0.toLowerCase() === m.pt.toLowerCase();
  const [sqrtNow, tickNow] = await pool.slot0();
  const ptNow = cl.ptPriceFromSqrt(sqrtNow, ptIs0);

  // Range strictly beyond the current price, on the PT-only side.
  const lowPt = ptNow * 1.0003;
  let [tickLower, tickUpper] = cl.rangeTicks(lowPt, highPt, ptIs0, TICK_SPACING);
  const now = Number(tickNow);
  if (ptIs0 && tickLower <= now) tickLower = now + TICK_SPACING;
  if (!ptIs0 && tickUpper >= now) tickUpper = now - TICK_SPACING;

  const bal = await pt.balanceOf(signer.address);
  if (bal < amount) throw new Error(`Only ${ethers.formatEther(bal)} PT in wallet`);
  console.log(`PT price now ${ptNow.toFixed(5)}; adding ${ethers.formatEther(amount)} PT for PT prices ${lowPt.toFixed(5)}–${highPt}`);

  await (await pt.approve(A.clPositionManager, amount)).wait();
  const npm = new ethers.Contract(A.clPositionManager, cl.NPM_ABI, signer);
  const block = await ethers.provider.getBlock("latest");
  const params = {
    token0,
    token1: await pool.token1(),
    tickSpacing: TICK_SPACING,
    tickLower,
    tickUpper,
    amount0Desired: ptIs0 ? amount : 0n,
    amount1Desired: ptIs0 ? 0n : amount,
    amount0Min: 0,
    amount1Min: 0,
    recipient: signer.address,
    deadline: block.timestamp + 3600,
    sqrtPriceX96: 0,
  };
  const rc = await (await npm.mint(params)).wait();
  const log = rc.logs.map((l) => { try { return npm.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "Transfer");
  console.log(`Position ${log?.args.tokenId} added. tx ${rc.hash}`);

  if (network.name !== "hardhat") {
    m.extraPositions = [...(m.extraPositions || []), { tokenId: log?.args.tokenId?.toString(), tickLower, tickUpper, pt: ethers.formatEther(amount), tx: rc.hash }];
    D.save(cid, dep);
  }
}

module.exports = main;
if (!process.env.TENOR_NO_AUTORUN) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
