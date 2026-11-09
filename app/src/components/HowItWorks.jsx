import { useRef } from "react";
import { date } from "../lib/format";
import { Cursors } from "./Cursors";
import { TokenBadge } from "./visuals";

/** A connector whose dashes flow in the direction value moves. */
function Wire({ dir = "h" }) {
  return (
    <svg className={`wire wire-${dir}`} viewBox={dir === "h" ? "0 0 100 2" : "0 0 2 100"} preserveAspectRatio="none" aria-hidden="true">
      {dir === "h" ? <line x1="0" y1="1" x2="100" y2="1" /> : <line x1="1" y1="0" x2="1" y2="100" />}
    </svg>
  );
}

function Fork() {
  return (
    <svg className="fork" viewBox="0 0 60 200" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 100 H20 C34 100 30 50 44 50 H60" />
      <path d="M0 100 H20 C34 100 30 150 44 150 H60" />
    </svg>
  );
}

export function HowItWorks({ maturity, apy }) {
  const d = date(maturity);
  const flowRef = useRef(null);
  return (
    <section className="how" aria-labelledby="how-title">
      <div className="how-head">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title">One deposit, split into a fixed part and a variable part</h2>
        <p className="lede">
          Tenor deposits your MUSD into Mezo’s sMUSD savings vault and splits the position in two. Keep the part you want,
          sell the other.
        </p>
      </div>

      <div className="flow" ref={flowRef} role="img" aria-label={`MUSD goes into Mezo's sMUSD vault, which splits into PT, worth 1 MUSD on ${d}, and YT, which earns the sMUSD yield until then.`}>
        <div className="node" data-node="musd">
          <TokenBadge sym="MUSD" />
          <div>
            <b>MUSD</b>
            <span>You deposit</span>
          </div>
        </div>
        <Wire />
        <Wire dir="v" />
        <div className="node node-vault" data-node="vault">
          <svg className="vault-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5" />
          </svg>
          <div>
            <b>sMUSD</b>
            <span>Mezo savings vault</span>
          </div>
        </div>
        <Fork />
        <Wire dir="v" />
        <div className="outs">
          <div className="node node-pt" data-node="pt">
            <TokenBadge sym="PT" />
            <div>
              <b>PT · fixed</b>
              <span>Worth 1 MUSD on {d}</span>
            </div>
          </div>
          <div className="node node-yt" data-node="yt">
            <TokenBadge sym="YT" />
            <div>
              <b>YT · variable</b>
              <span>Earns sMUSD yield until then</span>
            </div>
          </div>
        </div>
        <Cursors flowRef={flowRef} apy={apy} maturityLabel={d} />
      </div>

      <ol className="uses">
        <li>
          <span className="use-n">1</span>
          <h3>Fix my yield</h3>
          <p>Buy PT below 1 MUSD. It redeems for exactly 1 MUSD on {d}, so your return is set the moment you buy.</p>
        </li>
        <li>
          <span className="use-n">2</span>
          <h3>Sell future yield</h3>
          <p>Deposit MUSD, keep the PT and sell the YT. You get the yield in MUSD today and your deposit back at maturity.</p>
        </li>
        <li>
          <span className="use-n">3</span>
          <h3>Trade YT</h3>
          <p>Buy YT if you expect sMUSD to pay more than the fixed rate. It can’t be liquidated; at worst it earns nothing.</p>
        </li>
      </ol>

      <div className="risks" id="risks">
        <h3>Risks</h3>
        <ul>
          <li>Tenor’s contracts are open source and tested, but not audited. This deployment is on Mezo Testnet.</li>
          <li>PT is backed 1:1 by sMUSD. If Mezo’s sMUSD vault or MUSD itself fails, PT is affected the same way.</li>
          <li>Selling PT or YT before maturity happens at the pool price, which moves with trades and liquidity.</li>
          <li>YT is worth only the yield sMUSD pays until maturity, which can be zero.</li>
        </ul>
      </div>
    </section>
  );
}
