import { useAccount } from "wagmi";
import { ABI, CHAIN } from "../config";
import { ME } from "../hooks/useTx";
import { amount, date, numToWei } from "../lib/format";
import { useQuote } from "../hooks/useQuote";
import { formatEther } from "viem";
import { Row, TxStatus } from "./ui";

export function Position({ t, tx }) {
  const { isConnected } = useAccount();
  const scope = "pos";
  const exitQuote = useQuote(t, "sellPT", t.raw.pt > 0n && !t.matured ? formatEther(t.raw.pt) : "");
  const exit = exitQuote.data;
  const pair = t.raw.pt < t.raw.yt ? t.raw.pt : t.raw.yt;
  const send = (label, req) => tx.send(scope, label, req);

  return (
    <section className="card" aria-labelledby="pos-title">
      <h2 id="pos-title">Your position</h2>
      {!isConnected ? (
        <p className="empty">Connect a wallet to see your PT, YT and yield for this maturity.</p>
      ) : (
        <>
          <Row k="MUSD" v={amount(t.musd, 4)} />
          <Row k="PT" hint="fixed" v={amount(t.pt, 4)} />
          <Row k="YT" hint="variable" v={amount(t.yt, 4)} />
          <Row k="Yield to claim" v={`${amount(t.yieldClaimable, 6)} MUSD`} strong />
          {t.pt > 0 && <Row k={t.matured ? "PT redeems for" : "PT worth now"} v={`${amount(t.matured ? t.pt : exit?.out, 4)} MUSD`} />}

          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={tx.busy || !(t.yieldClaimable > 0)}
              onClick={() => send("Claim yield", { address: t.m.market, abi: ABI.market, functionName: "claimYield", args: [ME] })}
            >
              Claim yield
            </button>
            {t.matured ? (
              <button
                type="button"
                className="btn primary"
                disabled={tx.busy || t.raw.pt === 0n}
                onClick={() => send(`Redeem ${amount(t.pt)} PT`, { address: t.m.market, abi: ABI.market, functionName: "redeemPT", args: [t.raw.pt, ME] })}
              >
                Redeem PT 1:1
              </button>
            ) : (
              <>
                {t.raw.pt > 0n && (
                  <button
                    type="button"
                    className="btn"
                    disabled={tx.busy || !exit?.ok}
                    onClick={() =>
                      t.approved.pt
                        ? send(`Sell ${amount(t.pt)} PT`, {
                            address: CHAIN.router,
                            abi: ABI.router,
                            functionName: "sellPT",
                            args: [t.m.market, t.m.pool, t.raw.pt, numToWei(exit.out * 0.995), ME],
                          })
                        : tx.approve(scope, t.m.pt, CHAIN.router, "Approve PT")
                    }
                  >
                    {t.approved.pt ? "Sell PT early" : "Approve PT to sell"}
                  </button>
                )}
                {pair > 0n && (
                  <button
                    type="button"
                    className="btn"
                    disabled={tx.busy}
                    onClick={() => send("Merge PT + YT into MUSD", { address: t.m.market, abi: ABI.market, functionName: "redeemPair", args: [pair, ME] })}
                  >
                    Merge PT + YT
                  </button>
                )}
              </>
            )}
          </div>
          <TxStatus tx={tx} scope={scope} />
          {!t.matured && t.pt > 0 && <p className="note">PT redeems 1:1 for MUSD from {date(t.m.maturity)}.</p>}
        </>
      )}
    </section>
  );
}
