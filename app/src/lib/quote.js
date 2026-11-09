// Off-chain quotes for a Mezo CL pool, using Uniswap V3 swap math inside one
// liquidity range. Tenor's pools hold liquidity in one PT price range, so
// this matches the chain (checked against eth_call simulation to 4 decimals).
// A trade that would push the price out of that range is flagged, and every
// trade is simulated on-chain with a slippage limit before it is sent.
//
// All amounts are plain numbers in token units (not wei).

const FEE = 0.0001; // 0.01% fee tier (tick spacing 1)
const Q96 = 2 ** 96;
const YEAR = 365 * 24 * 3600;

export function poolView({ sqrtPriceX96, liquidity, token0, pt, range }) {
  const sqrtP = Number(sqrtPriceX96) / Q96;
  const L = Number(liquidity) / 1e18;
  const ptIs0 = token0.toLowerCase() === pt.toLowerCase();
  const p = sqrtP * sqrtP; // token1 per token0
  return { sqrtP, L, ptIs0, ptPrice: ptIs0 ? p : 1 / p, range };
}

const ptPriceAt = (v, s) => (v.ptIs0 ? s * s : 1 / (s * s));

// Each returns { out|in, s2 } where s2 is the sqrt price after the swap.
function in0(v, dx) {
  const s2 = (v.L * v.sqrtP) / (v.L + dx * (1 - FEE) * v.sqrtP);
  return { amt: v.L * (v.sqrtP - s2), s2 };
}
function in1(v, dy) {
  const s2 = v.sqrtP + (dy * (1 - FEE)) / v.L;
  return { amt: v.L * (1 / v.sqrtP - 1 / s2), s2 };
}
function exactOut1(v, dy) {
  const s2 = v.sqrtP - dy / v.L;
  if (!(s2 > 0)) return { amt: Infinity, s2: 0 };
  return { amt: (v.L * (1 / s2 - 1 / v.sqrtP)) / (1 - FEE), s2 };
}
function exactOut0(v, dx) {
  const inv = 1 / v.sqrtP - dx / v.L;
  if (!(inv > 0)) return { amt: Infinity, s2: Infinity };
  const s2 = 1 / inv;
  return { amt: (v.L * (s2 - v.sqrtP)) / (1 - FEE), s2 };
}

function withRange(v, r) {
  const after = ptPriceAt(v, r.s2);
  const [lo, hi] = v.range || [0, Infinity];
  const ok = Number.isFinite(r.amt) && r.amt >= 0 && v.L > 0 && after >= lo && after <= hi;
  return { amt: r.amt, ptPriceAfter: after, ok };
}

const ptForMusd = (v, musd) => withRange(v, v.ptIs0 ? in1(v, musd) : in0(v, musd));
const musdForPt = (v, pt) => withRange(v, v.ptIs0 ? in0(v, pt) : in1(v, pt));
const musdToBuyExactPt = (v, pt) => withRange(v, v.ptIs0 ? exactOut0(v, pt) : exactOut1(v, pt));

export function apyFromPrice(price, secondsLeft) {
  if (!(secondsLeft > 0) || !(price > 0)) return null;
  return Math.pow(1 / price, YEAR / secondsLeft) - 1;
}

/** Fix my yield: MUSD -> PT. */
export function quoteFix(v, musd, secondsLeft) {
  const r = ptForMusd(v, musd);
  return { ok: r.ok, pt: r.amt, gain: r.amt - musd, apy: apyFromPrice(musd / r.amt, secondsLeft) };
}

/** Sell my future yield: deposit MUSD, keep PT, get MUSD now. */
export function quoteCashOut(v, musd) {
  const r = musdToBuyExactPt(v, musd);
  return { ok: r.ok && r.amt < musd, now: Math.max(0, musd - r.amt), pt: musd };
}

/** Buy YT: MUSD cost of ytOut YT. */
export function quoteBuyYT(v, yt) {
  const r = musdForPt(v, yt);
  return { ok: r.ok, cost: Math.max(0, yt - r.amt) };
}

/** Sell YT: MUSD received for ytIn YT. */
export function quoteSellYT(v, yt) {
  const r = musdToBuyExactPt(v, yt);
  return { ok: r.ok && r.amt < yt, out: Math.max(0, yt - r.amt) };
}

/** Sell PT: MUSD received for ptIn PT. */
export function quoteSellPT(v, pt) {
  const r = musdForPt(v, pt);
  return { ok: r.ok, out: r.amt };
}

/** Largest input (to 2 decimals) for which quoteFn(v, x).ok holds, or 0. */
export function maxSize(v, quoteFn, upper = 1e7) {
  if (!v || !quoteFn(v, 0.01).ok) return 0;
  let lo = 0.01;
  let hi = upper;
  if (quoteFn(v, hi).ok) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (quoteFn(v, mid).ok) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}
