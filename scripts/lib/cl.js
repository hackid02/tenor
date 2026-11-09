// Helpers for Mezo concentrated-liquidity (CL) pools holding PT/MUSD.
// "PT price" always means MUSD per 1 PT (below 1 before maturity).

const Q96 = 2n ** 96n;
const TICK_BASE = 1.0001;

const CL_FACTORY_ABI = [
  "function createPool(address,address,int24,uint160) returns (address)",
  "function getPool(address,address,int24) view returns (address)",
];
const CL_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function tickSpacing() view returns (int24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,bool)",
];
const NPM_ABI = [
  "function mint((address token0,address token1,int24 tickSpacing,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline,uint160 sqrtPriceX96)) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

/// sqrtPriceX96 for a pool price (token1 per token0).
function sqrtX96(poolPrice) {
  const s = Math.sqrt(poolPrice);
  return BigInt(Math.floor(s * 2 ** 52)) << 44n;
}

function tickOf(poolPrice) {
  return Math.floor(Math.log(poolPrice) / Math.log(TICK_BASE));
}

/// Pool price (token1 per token0) for a given PT price.
function poolPriceFromPt(ptPrice, ptIs0) {
  return ptIs0 ? ptPrice : 1 / ptPrice;
}

/// PT price (MUSD per PT) from the pool's current sqrtPriceX96.
function ptPriceFromSqrt(sqrtPriceX96, ptIs0) {
  const s = Number(sqrtPriceX96) / Number(Q96);
  const p = s * s; // token1 per token0
  return ptIs0 ? p : 1 / p;
}

/// Tick range covering PT prices [lowPt, highPt], aligned to tickSpacing.
function rangeTicks(lowPt, highPt, ptIs0, spacing = 1) {
  const a = tickOf(poolPriceFromPt(lowPt, ptIs0));
  const b = tickOf(poolPriceFromPt(highPt, ptIs0));
  let lo = Math.min(a, b);
  let hi = Math.max(a, b);
  lo = Math.floor(lo / spacing) * spacing;
  hi = Math.ceil(hi / spacing) * spacing;
  return [lo, hi];
}

function apyFromPtPrice(ptPrice, secondsLeft) {
  const years = secondsLeft / (365 * 24 * 3600);
  return Math.pow(1 / ptPrice, 1 / years) - 1;
}

function ptPriceForApy(apy, secondsLeft) {
  const years = secondsLeft / (365 * 24 * 3600);
  return Math.pow(1 + apy, -years);
}

module.exports = {
  CL_FACTORY_ABI,
  CL_POOL_ABI,
  NPM_ABI,
  sqrtX96,
  tickOf,
  poolPriceFromPt,
  ptPriceFromSqrt,
  rangeTicks,
  apyFromPtPrice,
  ptPriceForApy,
};
