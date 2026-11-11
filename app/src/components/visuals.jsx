import { useMemo } from "react";
import { amount, date, percent, timeLeft } from "../lib/format";
import { dayLabel, monthName, monthStarts, tickDecimals, ticks, useHover, useWidth } from "../lib/chart";

/** Small token mark used next to amounts. */
export function TokenBadge({ sym }) {
  return (
    <span className={`badge badge-${sym.toLowerCase()}`} aria-hidden="true">
      {sym === "MUSD" ? "M" : sym}
    </span>
  );
}

const YEAR = 365 * 86400;

/** Spreads right-hand labels so none overlap, keeping each near its point. */
function spread(labels, gap, top, bottom) {
  const out = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < out.length; i++) if (out[i].y - out[i - 1].y < gap) out[i].y = out[i - 1].y + gap;
  const over = out.length ? out[out.length - 1].y - bottom : 0;
  if (over > 0) out.forEach((l) => (l.y -= over));
  for (let i = 0; i < out.length; i++) out[i].y = Math.max(top + i * gap, out[i].y);
  return out;
}

/**
 * The fixed quote as one certain path to maturity, drawn against the range
 * sMUSD's variable rate has actually spanned this year. Values come from the
 * quote itself, so the fixed line ends exactly at the maturity value.
 */
export function FixChart({ musdIn, valueAtMaturity, apy, maturity, variableLow, variableHigh }) {
  const [ref, W] = useWidth();
  const H = 156;
  const pad = { l: 40, r: 58, t: 14, b: 26 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const span = Math.max(1, maturity - now);
  const ok = musdIn > 0 && valueAtMaturity > musdIn && apy > 0;
  const band = ok && variableHigh > 0 && variableLow >= 0;
  const lowR = band ? Math.min(variableLow, variableHigh) : 0;
  const highR = band ? Math.max(variableLow, variableHigh) : 0;

  const fixedAt = (f) => musdIn * Math.pow(valueAtMaturity / musdIn, f);
  const varAt = (r, f) => musdIn * Math.pow(1 + r, (span / YEAR) * f);
  const top = Math.max(valueAtMaturity, band ? varAt(highR, 1) : 0);
  const { values: yTicks, step } = ticks(musdIn, top, 3);
  const lo = Math.min(musdIn, yTicks[0] ?? musdIn);
  const hi = Math.max(top, yTicks[yTicks.length - 1] ?? top) + (top - musdIn) * 0.06;
  const x = (f) => pad.l + f * pw;
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * ph;
  const path = (fn) => {
    let d = "";
    for (let i = 0; i <= 48; i++) d += `${i ? "L" : "M"}${x(i / 48).toFixed(1)} ${y(fn(i / 48)).toFixed(1)}`;
    return d;
  };
  const fixedD = ok ? path(fixedAt) : "";
  let bandD = "";
  if (band) {
    bandD = path((f) => varAt(highR, f));
    for (let i = 48; i >= 0; i--) bandD += `L${x(i / 48).toFixed(1)} ${y(varAt(lowR, i / 48)).toFixed(1)}`;
    bandD += "Z";
  }
  const dec = tickDecimals(step);
  const months = monthStarts(now, maturity).filter((t) => {
    const px = x((t - now) / span);
    return px > pad.l + 44 && px < pad.l + pw - 52;
  });

  const ends = spread(
    [
      ok && { key: "fixed", y: y(valueAtMaturity), text: amount(valueAtMaturity, 2), cls: "ch-endlabel strong" },
      band && { key: "hi", y: y(varAt(highR, 1)), text: amount(varAt(highR, 1), 2), cls: "ch-endlabel" },
      band && { key: "lo", y: y(varAt(lowR, 1)), text: amount(varAt(lowR, 1), 2), cls: "ch-endlabel" },
    ].filter(Boolean),
    14,
    pad.t + 4,
    pad.t + ph + 4
  );

  const { f: hf, bind } = useHover(pad.l, pw);
  const hover = ok && hf != null ? { f: hf, t: now + hf * span, v: fixedAt(hf) } : null;

  return (
    <figure
      className="chart fixchart"
      aria-label={ok ? `Your ${amount(musdIn)} MUSD grows to ${amount(valueAtMaturity, 4)} MUSD by ${date(maturity)} at ${percent(apy)} fixed.` : "Enter an amount to see your fixed return."}
    >
      <div ref={ref} className="chart-plot" {...bind}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + pw} y1={y(v)} y2={y(v)} className="ch-grid" />
              <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end" className="ch-glabel">{v.toFixed(dec)}</text>
            </g>
          ))}
          {months.map((t) => (
            <line key={t} x1={x((t - now) / span)} x2={x((t - now) / span)} y1={pad.t} y2={pad.t + ph} className="ch-grid ch-vgrid" />
          ))}
          {band && <path d={bandD} className="ch-band" />}
          {ok && <path d={fixedD} className="ch-line" />}
          <circle cx={x(0)} cy={y(musdIn)} r="3" className="ch-start" />
          {ok && <circle cx={x(1)} cy={y(valueAtMaturity)} r="4" className="ch-dot" />}
          {ends.map((l) => (
            <text key={l.key} x={W} y={l.y + 4} textAnchor="end" className={l.cls}>{l.text}</text>
          ))}
          <text x={pad.l} y={H - 6} className="ch-xlabel">Today</text>
          {months.map((t) => (
            <text key={t} x={x((t - now) / span)} y={H - 6} textAnchor="middle" className="ch-xlabel">{monthName(t)}</text>
          ))}
          <text x={pad.l + pw} y={H - 6} textAnchor="end" className="ch-xlabel">{dayLabel(maturity)}</text>
          {hover && (
            <g>
              <line x1={x(hover.f)} x2={x(hover.f)} y1={pad.t} y2={pad.t + ph} className="ch-cross" />
              <circle cx={x(hover.f)} cy={y(hover.v)} r="3.5" className="ch-dot" />
            </g>
          )}
        </svg>
        {hover && (
          <div className="ch-tip" style={{ left: Math.min(Math.max(x(hover.f), 70), W - 70) }}>
            <span>{dayLabel(hover.t)}</span>
            <b className="num">{amount(hover.v, 2)} MUSD</b>
          </div>
        )}
      </div>
      <figcaption className="chart-legend">
        <span><i className="lg-line" />Fixed {percent(apy)}</span>
        {band && <span><i className="lg-band" />If sMUSD pays {percent(lowR, 0)}–{percent(highR)}</span>}
      </figcaption>
    </figure>
  );
}

/** Tenor's fixed rate next to what sMUSD actually paid recently on mainnet. */
export function RateCompare({ fixed, variable, loading, maturity }) {
  const max = Math.max(fixed ?? 0, variable ?? 0, 0.0001);
  const w = (v) => `${Math.max(2, (Math.max(0, v ?? 0) / max) * 100)}%`;
  let verdict = null;
  let read = null; // who each side suits, at these rates
  if (fixed != null && fixed <= 0) {
    verdict = "PT trades at or above 1 MUSD right now, so there is no fixed yield to lock on this maturity.";
  } else if (fixed != null && variable != null) {
    const d = fixed - variable;
    if (Math.abs(d) < 0.0025) {
      verdict = "The fixed rate is about the same as what sMUSD paid last week.";
    } else if (d > 0) {
      verdict = `Fixing pays ${percent(d)} more than sMUSD paid last week.`;
      read = `The market expects sMUSD to pay more than last week until ${date(maturity)}. If you think it will pay less, fixing is the better side. If you think it will pay more, buy YT.`;
    } else {
      verdict = `Fixing pays ${percent(-d)} less than sMUSD paid last week.`;
      read = `The market expects sMUSD to average about ${percent(fixed)} until ${date(maturity)}, below last week's rate. Fix if you want a known return whatever happens. If you think sMUSD will stay near ${percent(variable)}, buy YT: you get every MUSD it pays.`;
    }
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
      {verdict && (
        <p className="note">
          {verdict}
          {read && <span className="note-read"> {read}</span>}
        </p>
      )}
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

