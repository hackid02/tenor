// Off-chain quoting helpers shared by tests, scripts and the app.

/// Smallest MUSD amount x such that pool.getAmountOut(x, musd) >= ptWanted.
/// Used to price selling YT (the router flash-buys ptWanted PT with x MUSD).
async function musdNeededForPT(pool, musd, ptWanted) {
  let lo = 0n;
  let hi = ptWanted * 2n + 10n ** 18n;
  while ((await pool.getAmountOut(hi, musd)) < ptWanted) hi *= 2n;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if ((await pool.getAmountOut(mid, musd)) >= ptWanted) hi = mid;
    else lo = mid;
  }
  // tiny buffer against rounding in the pool's invariant check
  return hi + hi / 100000n + 1n;
}

/// Implied fixed APY from the price of PT in MUSD and seconds to maturity.
function impliedApy(musdIn, ptOut, secondsLeft) {
  const price = Number(musdIn) / Number(ptOut);
  const years = secondsLeft / (365 * 24 * 3600);
  return Math.pow(1 / price, 1 / years) - 1;
}

module.exports = { musdNeededForPT, impliedApy };
