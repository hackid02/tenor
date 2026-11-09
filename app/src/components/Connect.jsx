import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";

/**
 * Connect button. Uses wallets announced by the browser (EIP-6963, e.g. the
 * Mezo wallet, MetaMask, Rabby) and falls back to the generic injected
 * wallet. With more than one wallet installed it shows a short list.
 */
export function ConnectButton({ className = "btn primary", label = "Connect wallet" }) {
  const { connect, connectors, isPending, error, reset } = useConnect();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const named = connectors.filter((c) => c.id !== "injected");
  const options = named.length ? named : connectors;

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function start() {
    reset();
    if (options.length > 1) setOpen((o) => !o);
    else connect({ connector: options[0] });
  }

  const noWallet = error && /provider|not found|undefined|no wallet/i.test(error.message);

  return (
    <div className="connect" ref={ref}>
      <button type="button" className={className} onClick={start} aria-expanded={options.length > 1 ? open : undefined}>
        {isPending ? "Connecting…" : label}
      </button>
      {open && (
        <div className="menu" role="menu">
          {options.map((c) => (
            <button
              key={c.uid}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                connect({ connector: c });
              }}
            >
              {c.icon && <img src={c.icon} alt="" width="20" height="20" />}
              {c.name}
            </button>
          ))}
        </div>
      )}
      {noWallet && (
        <p className="connect-err" role="alert">
          No browser wallet found. Install one, then add Mezo Testnet.
        </p>
      )}
      {error && !noWallet && !/rejected|denied/i.test(error.message) && (
        <p className="connect-err" role="alert">{error.shortMessage || "Couldn’t connect. Try again."}</p>
      )}
    </div>
  );
}
