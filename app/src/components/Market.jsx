import { CHAIN, LINKS } from "../config";
import { amount, date, percent } from "../lib/format";
import { Row, Skeleton } from "./ui";
import { RateCompare, TermProgress } from "./visuals";
import { LiveStatus, RateHistory } from "./live";
import { useSmusdRate } from "../hooks/useSmusdRate";

const addr = (a) => `${LINKS.explorer}/address/${a}`;

export function MarketPicker({ marketKey, setMarketKey }) {
  const keys = Object.keys(CHAIN.markets);
  return (
    <div className="picker" role="radiogroup" aria-label="Maturity">
      {keys.map((k) => {
        const m = CHAIN.markets[k];
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={k === marketKey}
            className={k === marketKey ? "on" : ""}
            onClick={() => setMarketKey(k)}
          >
            {date(m.maturity)}
            {m.label === "DEMO" && <span className="tag">Demo</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Market({ t, history, marketKey, setMarketKey }) {
  const m = t.m;
  const smusd = useSmusdRate();
  // Two grid areas so phones show the trade card right after the rate.
  return (
    <>
    <section className="market market-head" aria-labelledby="market-title">
      <LiveStatus />
      <p className="eyebrow">PT-sMUSD · Mezo MUSD Savings Vault</p>
      <h1 id="market-title">
        {t.ready ? <span key={percent(t.apy)} className="apy num tick">{percent(t.apy)}</span> : <Skeleton w="5.5ch" h="0.9em" />}
        <span className="apy-label">fixed on MUSD until {date(m.maturity)}</span>
      </h1>
      <p className="lede">
        Mezo’s savings vault pays a variable rate. Buy PT to lock today’s rate until maturity, or sell the yield
        you would earn for MUSD now.
      </p>

      <MarketPicker marketKey={marketKey} setMarketKey={setMarketKey} />
    </section>

    <section className="market market-facts" aria-label="Market details">
      <RateCompare fixed={t.apy} variable={smusd.data?.apr ?? null} loading={smusd.isLoading} maturity={m.maturity} />
      <RateHistory points={history.data?.points} current={t.apy} />
      <TermProgress start={m.start} maturity={m.maturity} />
      <div className="facts">
        <Row k="PT price" v={t.ready ? `${t.view.ptPrice.toFixed(4)} MUSD` : <Skeleton />} />
        <Row k="Pool liquidity" v={t.ready ? `${amount(t.poolMusd, 0)} MUSD + ${amount(t.poolPt, 0)} PT` : <Skeleton w="12ch" />} />
        <Row k="MUSD deposited via Tenor" v={t.ready ? amount(t.tvl, 0) : <Skeleton />} />
        <Row k="Protocol fee" v={`${m.feeBps / 100}% of YT yield`} />
      </div>

      <p className="contracts">
        <a href={addr(m.market)} target="_blank" rel="noreferrer">Market</a>
        <a href={addr(m.pool)} target="_blank" rel="noreferrer">Mezo CL pool</a>
        <a href={addr(CHAIN.smusd)} target="_blank" rel="noreferrer">sMUSD</a>
        <a href={LINKS.proof} target="_blank" rel="noreferrer">On-chain proof</a>
      </p>
    </section>
    </>
  );
}
