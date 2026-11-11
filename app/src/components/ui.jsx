import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "./Connect";
import { TokenBadge } from "./visuals";
import { LINKS, mezoTestnet } from "../config";
import { amount, cleanAmount } from "../lib/format";

export function Row({ k, v, strong, hint }) {
  return (
    <div className={`row${strong ? " strong" : ""}`}>
      <span>
        {k}
        {hint && <span className="hint"> {hint}</span>}
      </span>
      <span className="num">{v}</span>
    </div>
  );
}

export function Skeleton({ w = "6ch", h = "1em" }) {
  return <span className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />;
}

/** Amount field with balance and Max. `balance` is in the same unit as the input. */
export function AmountField({ id, label, value, onChange, unit, balance, balanceUnit, error }) {
  const { isConnected } = useAccount();
  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        {isConnected && balance !== undefined && (
          <button type="button" className="link-btn" onClick={() => onChange(String(Math.floor(balance * 1e6) / 1e6))}>
            Balance {amount(balance)} {balanceUnit || unit} · Max
          </button>
        )}
      </div>
      <div className={`amount${error ? " invalid" : ""}`}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(cleanAmount(e.target.value))}
        />
        <span className="unit"><TokenBadge sym={unit} />{unit}</span>
      </div>
      {error && <p className="field-err" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

/**
 * The one button a form needs. It walks the user through every state:
 * connect, switch network, enter amount, balance, liquidity, approve, act.
 */
export function ActionButton({ tx, scope, blocker, approve, children, onClick }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  let label = children;
  let action = onClick;
  let disabled = tx.busy;

  if (!isConnected) {
    return <ConnectButton className="btn primary block" />;
  }
  if (chainId !== mezoTestnet.id) {
    label = "Switch to Mezo Testnet";
    action = () => switchChain({ chainId: mezoTestnet.id });
  } else if (blocker) {
    label = blocker;
    disabled = true;
  } else if (approve) {
    label = approve.label;
    action = () => tx.approve(scope, approve.token, approve.spender, approve.label);
  }

  // Testers read "Approve" as the trade itself. Say it is one of two steps.
  let step = null;
  if (chainId === mezoTestnet.id && !blocker) {
    if (approve) step = `Step 1 of 2: approve ${approve.label.replace(/^Approve\s*/, "")} once. Then confirm the trade.`;
    else if (tx.state.scope === scope && tx.state.status === "done" && /^Approve/.test(tx.state.label || "")) step = "Step 2 of 2: confirm the trade.";
  }

  return (
    <>
      <button type="button" className="btn primary block" disabled={disabled} onClick={action}>
        {tx.busy && tx.state.scope === scope ? <span className="spinner" aria-hidden="true" /> : null}
        {label}
      </button>
      {step && !(tx.busy && tx.state.scope === scope) && <p className="step-hint">{step}</p>}
      <TxStatus tx={tx} scope={scope} />
    </>
  );
}

export function TxStatus({ tx, scope }) {
  const s = tx.state;
  if (s.status === "idle" || s.scope !== scope) return null;
  const link = s.hash && `${LINKS.explorer}/tx/${s.hash}`;
  const text = {
    pending: `Confirm in your wallet: ${s.label}`,
    mining: `Waiting for Mezo to confirm: ${s.label}`,
    done: `Done: ${s.label}`,
    sent: `Sent: ${s.label}. Mezo hasn’t reported it yet; check the explorer in a minute.`,
    error: s.error,
  }[s.status];
  return (
    <div className={`status ${s.status}`} role={s.status === "error" ? "alert" : "status"}>
      <span>{text}</span>
      {link && (
        <a href={link} target="_blank" rel="noreferrer">
          Explorer
        </a>
      )}
      {s.status === "done" && !/^Approve/.test(s.label || "") && (
        <a href={LINKS.feedback} target="_blank" rel="noreferrer">
          Give feedback
        </a>
      )}
      {(s.status === "done" || s.status === "error" || s.status === "sent") && (
        <button type="button" className="icon-btn" onClick={tx.reset} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
