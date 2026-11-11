import { useEffect, useState } from "react";
import { useBlockNumber } from "wagmi";
import { CHAIN, LINKS, mezoTestnet } from "../config";
import { date, percent, short } from "../lib/format";
import { dayLabel, tickDecimals, ticks, useHover, useWidth } from "../lib/chart";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
function ago(ts, now) {
  const s = Math.max(0, now - ts);
  if (s < 45) return "just now";
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), "day");
  return date(ts);
}

function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Live block height from Mezo Testnet, refreshed as new blocks arrive. */
export function LiveStatus() {
  const { data: block, isError } = useBlockNumber({ chainId: mezoTestnet.id, watch: true, query: { refetchInterval: 8_000 } });
  return (
    <p className={`live ${isError ? "off" : ""}`} aria-live="off">
      <span className="live-dot" aria-hidden="true" />
      {isError ? "Reconnecting to Mezo Testnet" : "Live on Mezo Testnet"}
      {block && !isError && (
        <a className="live-block num" href={`${LINKS.explorer}/block/${block}`} target="_blank" rel="noreferrer">
          #{block.toLocaleString()}
        </a>
      )}
    </p>
  );
}

/**
 * Fixed APY after every trade since the pool opened, plus the current rate.
 * Points are spaced by trade, not by time, so a burst of trades stays readable;
 * hover shows each trade's date.
 */
export function RateHistory({ points, current }) {
  const [ref, W] = useWidth();
  const now = Date.now() / 1000;
  // A rate at or below 0 means PT trades at or above 1 MUSD: there is no
  // fixed yield, so it is drawn at 0 and labelled "none", like the headline.
  const pts = (points || []).map((p) => ({ ...p, apy: Math.max(0, p.apy) }));
  if (current != null) pts.push({ ts: now, apy: Math.max(0, current), now: true });
  const rate = (v) => (v > 0 ? percent(v) : "none");
  const n = pts.length;
  const H = 132;
  const pad = { l: 34, r: 54, t: 12, b: 24 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const { f: hf, bind } = useHover(pad.l, pw);
  if (n < 2) return null;

  const trades = n - 2; // minus the opening price and "now"
  const vals = pts.map((p) => p.apy);
  const { values: yTicks, step } = ticks(Math.min(...vals), Math.max(...vals), 3);
  const lo = Math.min(yTicks[0], ...vals) - step * 0.15;
  const hi = Math.max(yTicks[yTicks.length - 1], ...vals) + step * 0.15;
  const x = (i) => pad.l + (i / (n - 1)) * pw;
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * ph;
  // Step line: the rate holds until the next trade moves it.
  let d = `M${x(0)} ${y(pts[0].apy).toFixed(1)}`;
  for (let i = 1; i < n; i++) d += ` H${x(i).toFixed(1)} V${y(pts[i].apy).toFixed(1)}`;
  const area = `${d} V${pad.t + ph} H${x(0)} Z`;
  const first = pts[0].apy;
  const last = pts[n - 1].apy;
  const dec = Math.max(0, tickDecimals(step * 100));
  const hi_ = hf == null ? null : Math.min(n - 1, Math.max(0, Math.round(hf * (n - 1))));
  const hp = hi_ == null ? null : pts[hi_];

  return (
    <figure className="chart history" aria-label={`Fixed APY moved from ${rate(first)} to ${rate(last)} over ${trades} trades.`}>
      <div className="history-top">
        <span>Fixed APY since launch</span>
        <span className="num">{rate(first)} → {rate(last)}</span>
      </div>
      <div ref={ref} className="chart-plot" {...bind}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + pw} y1={y(v)} y2={y(v)} className="ch-grid" />
              <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end" className="ch-glabel">{(v * 100).toFixed(dec)}%</text>
            </g>
          ))}
          <path d={area} className="ch-area" />
          <path d={d} className="ch-line" />
          {pts.slice(1, -1).map((p, i) => (
            <line key={i} x1={x(i + 1)} x2={x(i + 1)} y1={pad.t + ph} y2={pad.t + ph - 5} className="ch-rug" />
          ))}
          <circle cx={x(0)} cy={y(first)} r="3" className="ch-start" />
          <circle cx={x(n - 1)} cy={y(last)} r="9" className="ch-ring" />
          <circle cx={x(n - 1)} cy={y(last)} r="4" className="ch-dot" />
          <text x={W} y={y(last) + 4} textAnchor="end" className="ch-endlabel strong">{rate(last)}</text>
          <text x={pad.l} y={H - 6} className="ch-xlabel">Opened {dayLabel(pts[0].ts)}</text>
          <text x={pad.l + pw} y={H - 6} textAnchor="end" className="ch-xlabel">Now</text>
          {hp && (
            <g>
              <line x1={x(hi_)} x2={x(hi_)} y1={pad.t} y2={pad.t + ph} className="ch-cross" />
              <circle cx={x(hi_)} cy={y(hp.apy)} r="3.5" className="ch-dot" />
            </g>
          )}
        </svg>
        {hp && (
          <div className="ch-tip" style={{ left: Math.min(Math.max(x(hi_), 70), W - 70) }}>
            <span>{hp.now ? "Now" : hi_ === 0 ? `Opened ${dayLabel(hp.ts)}` : `Trade ${hi_} · ${dayLabel(hp.ts)}`}</span>
            <b className="num">{rate(hp.apy)}</b>
          </div>
        )}
      </div>
      <figcaption className="chart-legend">
        <span><i className="lg-rug" />{trades} {trades === 1 ? "trade" : "trades"}, one tick each</span>
      </figcaption>
    </figure>
  );
}

const KIND_LABEL = {
  fix: "Fix",
  cash: "Yield",
  exit: "Exit",
  yt: "YT",
  split: "Split",
  merge: "Merge",
  redeem: "Redeem",
  claim: "Claim",
};

/**
 * Who sent it. Wallets run by the Tenor team (the LP/deployer wallet and the
 * QA persona wallets) are labelled as such, so team activity is never
 * mistaken for outside users.
 */
function Who({ from, me }) {
  const a = from.toLowerCase();
  if (me && a === me.toLowerCase()) return "You";
  const team = CHAIN.team?.[a];
  if (team) return <span className="team-tag" title={from}>{team}</span>;
  return <span className="mono">{short(from)}</span>;
}

/** Every Tenor action on this market, newest first, linked to the explorer. */
export function ActivityFeed({ history, me }) {
  const now = useNow();
  const [showAll, setShowAll] = useState(false);
  const all = history.data?.activity || [];
  const items = showAll ? all : all.slice(0, 6);
  // Distinct senders that are not team or QA wallets.
  const outside = new Set(all.map((x) => x.from.toLowerCase()).filter((a) => !CHAIN.team?.[a])).size;
  return (
    <section className="card activity" aria-labelledby="act-title">
      <div className="card-head">
        <h2 id="act-title">Live activity</h2>
        <span className="muted small">{history.data ? `${history.data.count} on-chain${outside ? ` · ${outside} outside wallet${outside === 1 ? "" : "s"}` : ""}` : ""}</span>
      </div>
      {history.isLoading && (
        <ul className="act-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="act-item">
              <span className="skeleton" style={{ width: "44px", height: "20px" }} />
              <span className="skeleton" style={{ width: "60%", height: "14px" }} />
            </li>
          ))}
        </ul>
      )}
      {history.isError && <p className="empty">Couldn’t load activity from Mezo Testnet. Retrying.</p>}
      {history.data && all.length === 0 && <p className="empty">No trades yet on this maturity. Yours would be the first.</p>}
      {items.length > 0 && (
        <ul className="act-list">
          {items.map((it) => (
            <li key={it.hash} className="act-item">
              <span className={`act-kind k-${it.kind}`}>{KIND_LABEL[it.kind]}</span>
              <div className="act-body">
                <a href={`${LINKS.explorer}/tx/${it.hash}`} target="_blank" rel="noreferrer" className="act-title">
                  {it.title} {it.detail && <span className="act-detail">{it.detail}</span>}
                </a>
                <span className="act-meta">
                  <Who from={it.from} me={me} /> · {ago(it.ts, now)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {all.length > 6 && (
        <button type="button" className="btn ghost act-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show less" : `Show ${all.length - 6} more`}
        </button>
      )}
    </section>
  );
}
