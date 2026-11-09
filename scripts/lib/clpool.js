// Creates a PT/MUSD CL pool on Mezo Pools at a target fixed APY and adds a
// concentrated position over a PT price range. Shared by tests and scripts.
const { ethers } = require("hardhat");
const cl = require("./cl");

const TICK_SPACING = 1; // 0.01% fee tier

/// @param opts { signer, A (addresses), market (contract), apy, lowPt, highPt, ptAmount, musdAmount }
async function createAndSeed(opts) {
  const { signer, A, market } = opts;
  const pt = await market.pt();
  const musd = A.musd;
  const maturity = Number(await market.maturity());
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const secs = maturity - now;
  const ptIs0 = BigInt(pt) < BigInt(musd);
  const [token0, token1] = ptIs0 ? [pt, musd] : [musd, pt];

  const startPt = cl.ptPriceForApy(opts.apy, secs);
  const factory = new ethers.Contract(A.clFactory, cl.CL_FACTORY_ABI, signer);
  let poolAddr = await factory.getPool(token0, token1, TICK_SPACING);
  if (poolAddr === ethers.ZeroAddress) {
    const sqrt = cl.sqrtX96(cl.poolPriceFromPt(startPt, ptIs0));
    await (await factory.createPool(token0, token1, TICK_SPACING, sqrt)).wait();
    poolAddr = await factory.getPool(token0, token1, TICK_SPACING);
  }

  const [tickLower, tickUpper] = cl.rangeTicks(opts.lowPt, opts.highPt, ptIs0, TICK_SPACING);
  const ptTok = await ethers.getContractAt("TenorToken", pt, signer);
  const musdTok = await ethers.getContractAt("MockMUSD", musd, signer);
  await (await ptTok.approve(A.clPositionManager, opts.ptAmount)).wait();
  await (await musdTok.approve(A.clPositionManager, opts.musdAmount)).wait();

  const npm = new ethers.Contract(A.clPositionManager, cl.NPM_ABI, signer);
  const [amount0Desired, amount1Desired] = ptIs0 ? [opts.ptAmount, opts.musdAmount] : [opts.musdAmount, opts.ptAmount];
  const params = {
    token0,
    token1,
    tickSpacing: TICK_SPACING,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: await signer.getAddress(),
    deadline: now + 3600,
    sqrtPriceX96: 0,
  };
  const rc = await (await npm.mint(params)).wait();
  const log = rc.logs.map((l) => { try { return npm.interface.parseLog(l); } catch { return null; } })
    .find((x) => x && x.name === "Transfer");
  const tokenId = log ? log.args.tokenId : null;

  const pool = new ethers.Contract(poolAddr, cl.CL_POOL_ABI, signer);
  const [sqrtNow] = await pool.slot0();
  const ptPrice = cl.ptPriceFromSqrt(sqrtNow, ptIs0);
  return { pool: poolAddr, tokenId, tickLower, tickUpper, ptIs0, ptPrice, apy: cl.apyFromPtPrice(ptPrice, secs) };
}

/// Current PT price and implied fixed APY of a market's CL pool.
async function poolState(poolAddr, ptAddr, maturity) {
  const pool = new ethers.Contract(poolAddr, cl.CL_POOL_ABI, ethers.provider);
  const ptIs0 = (await pool.token0()).toLowerCase() === ptAddr.toLowerCase();
  const [sqrtNow] = await pool.slot0();
  const ptPrice = cl.ptPriceFromSqrt(sqrtNow, ptIs0);
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  return { ptPrice, apy: cl.apyFromPtPrice(ptPrice, Number(maturity) - now) };
}

module.exports = { createAndSeed, poolState, TICK_SPACING };
