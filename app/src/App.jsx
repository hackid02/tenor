import { useState } from "react";
import { useTenor } from "./hooks/useTenor";
import { useTx } from "./hooks/useTx";
import { Header } from "./components/Header";
import { Market } from "./components/Market";
import { TradeCard } from "./components/TradeCard";
import { Position } from "./components/Position";
import { Carry } from "./components/Carry";
import { Footer } from "./components/Footer";
import { HowItWorks } from "./components/HowItWorks";
import { ActivityFeed } from "./components/live";
import { useMarketHistory } from "./hooks/useMarketHistory";
import { useAccount } from "wagmi";

export default function App() {
  const [marketKey, setMarketKey] = useState("main");
  const t = useTenor(marketKey);
  const history = useMarketHistory(t.m);
  const { address } = useAccount();
  const tx = useTx(() => {
    t.refetch();
    history.refetch();
  });

  return (
    <div className="page">
      <Header />
      <main>
        {t.isError && !t.ready && (
          <p className="status error" role="alert">Can’t reach Mezo Testnet right now. Retrying every 15 seconds.</p>
        )}
        <div className="top">
          <Market t={t} history={history} marketKey={marketKey} setMarketKey={(k) => { tx.reset(); setMarketKey(k); }} />
          <TradeCard key={marketKey} t={t} tx={tx} />
        </div>
        <div className="lower">
          <Position t={t} tx={tx} />
          <Carry t={t} />
          <ActivityFeed history={history} me={address} />
        </div>
        <HowItWorks maturity={t.m.maturity} apy={t.apy} />
      </main>
      <Footer m={t.m} />
    </div>
  );
}

