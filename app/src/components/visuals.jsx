import { amount, date, percent, timeLeft } from "../lib/format";

/** Small token mark used next to amounts. */
export function TokenBadge({ sym }) {
  return (
    <span className={`badge badge-${sym.toLowerCase()}`} aria-hidden="true">
      {sym === "MUSD" ? "M" : sym}
    </span>
  );
}

/**
 * Your deposit growing on a fixed path to its maturity value.
 * Values are the quote itself, so the chart is exact at both ends.
 */
export function FixChart({ musdIn, valueAtMaturity, apy, maturity }) {
  const W = 320;
  const H = 112;
  const pad = { l: 4, r: 4, t: 16, b: 22 };
  const ok = musdIn > 0 && valueAtMaturity > musdIn && apy > 0;
  const lo = musdIn;
  const hi = ok ? valueAtMaturity : musdIn * 1.01;
  const x = (f) => pad.l + f * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const f = i / 24;
    // Compounding at the fixed rate; ends exactly at the maturity value.
    const v = ok ? musdIn * Math.pow(valueAtMaturity / musdIn, f) : musdIn;
    pts.push([x(f), y(v)]);
  }
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(1)} ${y(lo)} L${x(0)} ${y(lo)} Z`;

  return (
    <figure className="fixchart" aria-label={ok ? `Your ${amount(musdIn)} MUSD grows to ${amount(valueAtMaturity, 4)} MUSD by ${date(maturity)} at ${percent(apy)} fixed.` : "Enter an amount to see your fixed return."}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-hidden="true">
        <line x1={x(0)} x2={x(1)} y1={y(lo)} y2={y(lo)} className="fc-base" />
        {ok && <path d={area} className="fc-area" />}
        <path d={line} className="fc-line" />
        <circle cx={x(1)} cy={pts[pts.length - 1][1]} r="4" className="fc-dot" />
      </svg>
      <figcaption>
        <span>Today · {amount(musdIn, 2)} MUSD</span>
        <span className="fc-end">{date(maturity)} · {ok ? amount(valueAtMaturity, 2) : "–"} MUSD</span>
      </figcaption>
    </figure>
  );
}

/** Tenor's fixed rate next to what sMUSD actually paid recently on mainnet. */
export function RateCompare({ fixed, variable, loading, maturity }) {
  const max = Math.max(fixed ?? 0, variable ?? 0, 0.0001);
  const w = (v) => `${Math.max(2, (Math.max(0, v ?? 0) / max) * 100)}%`;
  let verdict = null;
  if (fixed != null && fixed <= 0) {
    verdict = "PT trades at or above 1 MUSD right now, so there is no fixed yield to lock on this maturity.";
  } else if (fixed != null && variable != null) {
    const d = fixed - variable;
    verdict =
      Math.abs(d) < 0.0025
        ? "The fixed rate is about the same as what sMUSD paid last week."
        : d > 0
          ? `Fixing pays ${percent(d)} more than sMUSD paid last week.`
          : `Fixing pays ${percent(-d)} less than sMUSD paid last week: that is the price of certainty until ${date(maturity)}.`;
  }
  return (
    <div className="compare" aria-label="Fixed rate compared with sMUSD's recent variable rate">
      <div className="cmp-row">
        <div className="cmp-label">
          <span>Tenor fixed</span>
          <span className="num">{fixed != null && fixed <= 0 ? "None now" : percent(fixed)}</span>
        </div>
        <div className="cmp-track"><div className="cmp-bar fixed" style={{ width: w(fixed) }} /></div>
      </div>
      <div className="cmp-row">
        <div className="cmp-label">
          <span>sMUSD variable, last 7 days <span className="hint">(Mezo mainnet)</span></span>
          <span className="num">{loading ? "…" : percent(variable)}</span>
        </div>
        <div className="cmp-track"><div className="cmp-bar variable" style={{ width: loading ? "0%" : w(variable) }} /></div>
      </div>
      {verdict && <p className="note">{verdict}</p>}
    </div>
  );
}

/** How much of the term has passed. */
export function TermProgress({ start, maturity }) {
  const now = Date.now() / 1000;
  const total = maturity - (start || now);
  const f = total > 0 ? Math.min(1, Math.max(0, (now - (start || now)) / total)) : 1;
  return (
    <div className="term">
      <div className="term-top">
        <span>Term</span>
        <span className="num">{timeLeft(maturity - now)}{maturity - now > 0 ? " left" : ""}</span>
      </div>
      <div
        className="term-track"
        role="progressbar"
        aria-label="Time to maturity"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(f * 100)}
      >
        <div className="term-bar" style={{ transform: `scaleX(${f})` }} />
      </div>
      <div className="term-ends">
        <span>{start ? date(start) : ""}</span>
        <span>{date(maturity)}</span>
      </div>
    </div>
  );
}

