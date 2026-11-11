import { useEffect, useState } from "react";
import { useBlockNumber } from "wagmi";
import { CHAIN, LINKS, mezoTestnet } from "../config";
import { date, percent, short } from "../lib/format";

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
 * Points are spaced by trade, not by time, so a burst of trades stays readable.
 */
export function RateHistory({ points, current }) {
  const now = Date.now() / 1000;
  const pts = [...(points || [])];
  if (current != null) pts.push({ ts: now, apy: current });
  if (pts.length < 2) return null;

  const W = 320;
  const H = 72;
  const t0 = pts[0].ts;
  const trades = pts.length - 2; // minus the opening price and "now"
  const vals = pts.map((p) => p.apy);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const padV = Math.max((hi - lo) * 0.2, 0.002);
  lo -= padV;
  hi += padV;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 12);
  // Step line: the rate holds until the next trade moves it.
  let d = `M0 ${y(pts[0].apy).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` H${x(i).toFixed(1)} V${y(pts[i].apy).toFixed(1)}`;
  }
  const first = pts[0].apy;
  const last = pts[pts.length - 1].apy;

  return (
    <figure className="history" aria-label={`Fixed APY moved from ${percent(first)} to ${percent(last)} over ${trades} trades.`}>
      <div className="history-top">
        <span>Fixed APY since launch</span>
        <span className="num">{percent(first)} → {percent(last)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} className="hist-line" />
        {pts.slice(0, -1).map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.apy)} r="2.5" className="hist-dot" />
        ))}
        <circle cx={W} cy={y(last)} r="3.5" className="hist-now" />
      </svg>
      <figcaption>
        <span>Opened {date(t0)}</span>
        <span>{trades} {trades === 1 ? "trade" : "trades"} · now</span>
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
