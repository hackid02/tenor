// Spot price and APY maths for a Mezo CL pool. Trade quotes come from the
// on-chain TenorQuoter (hooks/useQuote.js), which is exact for any liquidity.

const Q96 = 2 ** 96;
const YEAR = 365 * 24 * 3600;

export function poolView({ sqrtPriceX96, liquidity, token0, pt, range }) {
  const sqrtP = Number(sqrtPriceX96) / Q96;
  const L = Number(liquidity) / 1e18;
  const ptIs0 = token0.toLowerCase() === pt.toLowerCase();
  const p = sqrtP * sqrtP; // token1 per token0
  return { sqrtP, L, ptIs0, ptPrice: ptIs0 ? p : 1 / p, range };
}


export function apyFromPrice(price, secondsLeft) {
  if (!(secondsLeft > 0) || !(price > 0)) return null;
  return Math.pow(1 / price, YEAR / secondsLeft) - 1;
}
