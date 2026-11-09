import { useState } from "react";
import { LINKS, MUSD_BORROW_RATE, MUSD_MIN_LOAN } from "../config";
import { amount, cleanAmount, date, percent } from "../lib/format";
import { Row } from "./ui";

/** Borrow MUSD at Mezo’s fixed rate, lock Tenor's fixed rate: the spread is fixed. */
export function Carry({ t }) {
  const [input, setInput] = useState("5000");
  const a = Math.max(0, Number(input) || 0);
  const yrs = t.secondsLeft / (365 * 24 * 3600);
  const ok = t.apy !== null && !t.matured;
  const spread = ok ? t.apy - MUSD_BORROW_RATE : null;
  const profit = ok ? a * (Math.pow(1 + t.apy, yrs) - 1) - a * MUSD_BORROW_RATE * yrs : null;

  return (
    <section className="card" aria-labelledby="carry-title">
      <h2 id="carry-title">Fixed carry on your bitcoin</h2>
      <p className="muted">
        Mezo lends MUSD against BTC at a fixed {percent(MUSD_BORROW_RATE, 0)}. Put the MUSD into PT and both sides of
        the trade are fixed until {date(t.m.maturity)}.
      </p>
      <div className="field">
        <label htmlFor="carry-in">MUSD borrowed</label>
        <div className="amount compact">
          <input id="carry-in" inputMode="decimal" autoComplete="off" value={input} onChange={(e) => setInput(cleanAmount(e.target.value))} />
          <span className="unit">MUSD</span>
        </div>
      </div>
      <Row k="Mezo borrow rate" v={percent(MUSD_BORROW_RATE)} />
      <Row k="Tenor fixed APY" v={percent(t.apy)} />
      <Row k="Locked spread" v={percent(spread)} strong />
      <Row k={`Profit by ${date(t.m.maturity)}`} v={profit === null ? "–" : `${amount(profit)} MUSD`} strong />
      <p className="note">
        Based on today’s pool price; large amounts get a lower rate. Mezo’s minimum loan is {amount(MUSD_MIN_LOAN, 0)} MUSD.{" "}
        <a href={LINKS.mezoApp} target="_blank" rel="noreferrer">Borrow on Mezo</a>
      </p>
    </section>
  );
}
