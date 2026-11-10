import { useState } from "react";
import { useAccount } from "wagmi";
import { ABI, CHAIN, LINKS } from "../config";
import { ME } from "../hooks/useTx";
import { amount, date, numToWei, percent, toWei } from "../lib/format";
import { useQuote } from "../hooks/useQuote";
import { ActionButton, AmountField, Row } from "./ui";
import { FixChart } from "./visuals";

const TABS = [
  ["fix", "Fix my yield"],
  ["cash", "Sell future yield"],
  ["yt", "Trade YT"],
];

export function TradeCard({ t, tx }) {
  const [tab, setTab] = useState("fix");
  return (
    <section className="card trade" aria-label="Trade">
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            className={tab === k ? "on" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {t.matured ? (
          <p className="empty">
            This market matured on {date(t.m.maturity)}. New positions are closed; redeem your PT in Your position.
          </p>
        ) : (
          <>
            {tab === "fix" && <FixForm t={t} tx={tx} />}
            {tab === "cash" && <CashForm t={t} tx={tx} />}
            {tab === "yt" && <YtForm t={t} tx={tx} />}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Shared checks: returns [amountNumber, fieldError, blocker].
 * `quote` comes from useQuote: exact, from the on-chain quoter.
 */
function check(input, balance, unit, quote) {
  const wei = toWei(input);
  const a = wei ? Number(input) : 0;
  if (!wei) return [0, null, "Enter an amount"];
  if (quote.error) return [a, null, "Can’t get a price right now"];
  if (quote.data && quote.data.noGain) {
    return [a, "PT costs 1 MUSD or more right now, so there is no fixed yield to lock or sell. It redeems for 1 MUSD at maturity.", "No fixed yield at this price"];
  }
  if (quote.data && !quote.data.ok) {
    const max = Math.floor(quote.data.max * 100) / 100;
    const msg = max > 0 ? `The pool can fill up to ${amount(max)} ${unit} right now.` : "The pool has no liquidity for this trade right now.";
    return [a, msg, "Amount too large for the pool"];
  }
  if (balance !== null && a > balance + 1e-12) return [a, `You have ${amount(balance)} ${unit}.`, `Not enough ${unit}`];
  if (!quote.data || !quote.current) return [a, null, "Getting the price…"];
  return [a, null, null];
}

function NoMusd({ t }) {
  const { isConnected } = useAccount();
  if (!isConnected || !t.ready || t.musd > 0) return null;
  return (
    <p className="tip">
      You have no test MUSD. Get test BTC from the <a href={LINKS.faucet} target="_blank" rel="noreferrer">Mezo faucet</a>,
      then swap BTC to MUSD on <a href={LINKS.mezoApp} target="_blank" rel="noreferrer">testnet.mezo.org</a>.
    </p>
  );
}

function FixForm({ t, tx }) {
  const [input, setInput] = useState("100");
  const { isConnected } = useAccount();
  const quote = useQuote(t, "fix", input);
  const q = quote.current ? quote.data : null;
  const dash = quote.data && !quote.current ? "…" : "–";
  const [a, err, blocker] = check(input, isConnected ? t.musd : null, "MUSD", quote);
  const maturity = date(t.m.maturity);
  return (
    <div className="form">
      <AmountField id="fix-in" label="You pay" value={input} onChange={setInput} unit="MUSD" balance={t.musd} error={err} />
      <NoMusd t={t} />
      <div className="quote" aria-live="polite">
        <Row k="You get" v={q?.ok ? `${amount(q.pt, 4)} PT` : dash} />
        <Row k={`Worth on ${maturity}`} v={q?.ok ? `${amount(q.pt, 4)} MUSD` : dash} />
        <Row k="Fixed return" v={q?.ok ? `+${amount(q.gain, 4)} MUSD` : dash} strong />
        <Row k="Fixed APY" v={q?.ok ? percent(q.apy) : dash} strong />
      </div>
      {q?.ok && <FixChart musdIn={a} valueAtMaturity={q.pt} apy={q.apy} maturity={t.m.maturity} />}
      <ActionButton
        tx={tx}
        scope="fix"
        blocker={blocker}
        approve={!t.approved.musd && { label: "Approve MUSD", token: CHAIN.musd, spender: CHAIN.router }}
        onClick={() =>
          tx.send("fix", `Lock ${amount(a)} MUSD at ${percent(q.apy)}`, {
            address: CHAIN.router,
            abi: ABI.router,
            functionName: "buyPT",
            args: [t.m.market, t.m.pool, toWei(input), numToWei(q.pt * 0.995), ME],
          })
        }
      >
        {q?.ok ? `Lock ${percent(q.apy)} until ${maturity}` : "Lock fixed rate"}
      </ActionButton>
      <p className="note">
        Each PT is backed by 1 MUSD in Mezo’s sMUSD vault and redeems for 1 MUSD at maturity. You can sell it before
        then at the pool price.
      </p>
    </div>
  );
}

function CashForm({ t, tx }) {
  const [input, setInput] = useState("100");
  const { isConnected } = useAccount();
  const quote = useQuote(t, "cash", input);
  const q = quote.current ? quote.data : null;
  const dash = quote.data && !quote.current ? "…" : "–";
  const [a, err, blocker] = check(input, isConnected ? t.musd : null, "MUSD", quote);
  const maturity = date(t.m.maturity);
  return (
    <div className="form">
      <AmountField id="cash-in" label="You deposit" value={input} onChange={setInput} unit="MUSD" balance={t.musd} error={err} />
      <NoMusd t={t} />
      <div className="quote" aria-live="polite">
        <Row k="MUSD to you now" v={q?.ok ? `${amount(q.now, 4)} MUSD` : dash} strong />
        <Row k={`PT you keep, worth on ${maturity}`} v={q?.ok ? `${amount(q.pt, 2)} MUSD` : dash} />
        <Row k="You give up" v="sMUSD yield until maturity" />
      </div>
      <ActionButton
        tx={tx}
        scope="cash"
        blocker={blocker}
        approve={!t.approved.musd && { label: "Approve MUSD", token: CHAIN.musd, spender: CHAIN.router }}
        onClick={() =>
          tx.send("cash", `Sell future yield on ${amount(a)} MUSD`, {
            address: CHAIN.router,
            abi: ABI.router,
            functionName: "cashOutYield",
            args: [t.m.market, t.m.pool, toWei(input), numToWei(q.now * 0.98), ME],
          })
        }
      >
        {q?.ok ? `Get ${amount(q.now, 4)} MUSD now` : "Sell future yield"}
      </ActionButton>
      <p className="note">Your deposit is not sold. The PT you keep redeems for the full amount on {maturity}.</p>
    </div>
  );
}

function YtForm({ t, tx }) {
  const [side, setSide] = useState("buy");
  const [input, setInput] = useState("100");
  const { isConnected } = useAccount();
  const buy = side === "buy";
  const quote = useQuote(t, buy ? "buyYT" : "sellYT", input);
  const live = quote.current ? quote.data : null;
  const qb = buy ? live : null;
  const qs = buy ? null : live;
  const dash = quote.data && !quote.current ? "…" : "–";
  const cost = qb?.ok ? qb.cost : 0;
  // Buying is limited by MUSD (the cost), selling by YT held.
  const [a, err, blocker0] = check(input, buy ? null : isConnected ? t.yt : null, "YT", quote);
  const blocker = blocker0 || (buy && isConnected && cost > t.musd ? "Not enough MUSD" : null);
  const scope = "yt";

  return (
    <div className="form">
      <div className="seg" role="radiogroup" aria-label="Buy or sell YT">
        <button type="button" role="radio" aria-checked={buy} className={buy ? "on" : ""} onClick={() => setSide("buy")}>
          Buy YT
        </button>
        <button type="button" role="radio" aria-checked={!buy} className={!buy ? "on" : ""} onClick={() => setSide("sell")}>
          Sell YT
        </button>
      </div>
      <AmountField
        id="yt-in"
        label={buy ? "YT to buy" : "YT to sell"}
        value={input}
        onChange={setInput}
        unit="YT"
        balance={buy ? undefined : t.yt}
        error={err}
      />
      <div className="quote" aria-live="polite">
        {buy ? (
          <>
            <Row k="Cost" v={qb?.ok ? `${amount(qb.cost, 4)} MUSD` : dash} strong />
            <Row k="You earn" v={`sMUSD yield on ${amount(a, 0)} MUSD`} />
            <Row k="Profitable if sMUSD averages above" v={percent(t.apy)} />
          </>
        ) : (
          <Row k="You get" v={qs?.ok ? `${amount(qs.out, 4)} MUSD` : dash} strong />
        )}
      </div>
      <ActionButton
        tx={tx}
        scope={scope}
        blocker={blocker}
        approve={
          buy
            ? !t.approved.musd && { label: "Approve MUSD", token: CHAIN.musd, spender: CHAIN.router }
            : !t.approved.yt && { label: "Approve YT", token: t.m.yt, spender: CHAIN.router }
        }
        onClick={() =>
          buy
            ? tx.send(scope, `Buy ${amount(a)} YT`, {
                address: CHAIN.router,
                abi: ABI.router,
                functionName: "buyYT",
                args: [t.m.market, t.m.pool, toWei(input), numToWei(qb.cost * 1.02 + 1e-9), ME],
              })
            : tx.send(scope, `Sell ${amount(a)} YT`, {
                address: CHAIN.router,
                abi: ABI.router,
                functionName: "sellYT",
                args: [t.m.market, t.m.pool, toWei(input), numToWei(qs.out * 0.98), ME],
              })
        }
      >
        {buy ? `Buy ${amount(a, 2)} YT` : `Sell ${amount(a, 2)} YT`}
      </ActionButton>
      <p className="note">YT cannot be liquidated. If sMUSD pays no yield before maturity, YT is worth nothing.</p>
    </div>
  );
}
