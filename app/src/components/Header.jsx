import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { ConnectButton } from "./Connect";
import { LogoMark, ThemeToggle } from "./Brand";
import { LINKS, mezoTestnet } from "../config";
import { short } from "../lib/format";

export function Header() {
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrong = isConnected && chainId !== mezoTestnet.id;

  return (
    <header className="header">
      <a className="brand" href="/" aria-label="Tenor home">
        <LogoMark />
        Tenor
      </a>
      <div className="header-right">
        <span className="net">Mezo Testnet</span>
        <ThemeToggle />
        {!isConnected && <ConnectButton />}
        {wrong && (
          <button type="button" className="btn warn" onClick={() => switchChain({ chainId: mezoTestnet.id })}>
            Switch network
          </button>
        )}
        {isConnected && !wrong && (
          <div className="acct">
            <a className="btn ghost mono" href={`${LINKS.explorer}/address/${address}`} target="_blank" rel="noreferrer" title="View on Mezo explorer">
              {short(address)}
            </a>
            <button type="button" className="btn ghost" onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
