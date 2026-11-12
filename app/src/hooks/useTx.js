import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { maxUint256 } from "viem";
import { ERC20_ABI, mezoTestnet } from "../config";
import { explain } from "../lib/errors";

/** Placeholder in args for the connected wallet's address. */
export const ME = "__ME__";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mezo's public RPC is served by several nodes, and a node can lag behind the
 * one that accepted the transaction, so "receipt not found" is normal for a
 * while. Poll patiently; only a receipt with status "reverted" is a failure.
 * Returns the receipt, or null if none was seen within `ms`.
 */
async function waitForReceipt(pc, hash, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const rc = await pc.getTransactionReceipt({ hash });
      if (rc) return rc;
    } catch {
      // Not indexed on this node yet; keep polling.
    }
    await sleep(2_000);
  }
  return null;
}

/** EIP-1193 4100: the wallet has not authorized this site or account (yet). */
export function isUnauthorized(e) {
  for (let x = e; x; x = x.cause) {
    if (x.code === 4100 || /not been authori[sz]ed|unauthori[sz]ed/i.test(x.message || "")) return true;
  }
  return false;
}

const MEZO_HEX = "0x" + mezoTestnet.id.toString(16);

/** Before sending: if the wallet no longer lists the account, ask for it. */
async function ensureAccount(provider, address) {
  if (!provider?.request) return address;
  const accounts = await provider.request({ method: "eth_accounts" }).catch(() => []);
  if (accounts?.some((a) => a.toLowerCase() === address.toLowerCase())) return address;
  const granted = await provider.request({ method: "eth_requestAccounts" });
  return granted?.[0] || address;
}

/**
 * Recovery after a 4100 refusal. Newer MetaMask versions grant a site access
 * per network: if the user switched to Mezo Testnet inside the wallet, the
 * site still looks connected, but sending on Mezo Testnet is refused.
 * Asking for accounts again does not fix that (it answers without a prompt).
 * Switching through the site and requesting permissions does: MetaMask shows
 * its connect screen for the current network. Returns the address to use.
 */
async function reauthorize(provider, address) {
  if (!provider?.request) return address;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MEZO_HEX }] });
  } catch (e) {
    if (e?.code === 4001) throw e; // the user said no
  }
  try {
    await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  } catch (e) {
    if (e?.code === 4001) throw e;
    // Wallets without wallet_requestPermissions: fall back to the classic request.
    await provider.request({ method: "eth_requestAccounts" }).catch(() => null);
  }
  const accounts = await provider.request({ method: "eth_accounts" }).catch(() => []);
  return accounts?.find((a) => a.toLowerCase() === address.toLowerCase()) || accounts?.[0] || address;
}

/**
 * Sends a contract call after simulating it. Gas used on Mezo varies from
 * block to block (pool observations, Mezo fee distribution inside sMUSD),
 * so the estimate is doubled. Gas costs fractions of a cent.
 *
 * `scope` tags which card started the transaction so its status is shown
 * next to the button that caused it.
 */
export function useTx(onDone) {
  const pc = usePublicClient({ chainId: mezoTestnet.id });
  const { data: wallet } = useWalletClient();
  const { connector } = useAccount();
  const [state, setState] = useState({ status: "idle" });

  async function send(scope, label, rawReq) {
    if (!wallet) return;
    const req = { ...rawReq, args: (rawReq.args || []).map((a) => (a === ME ? wallet.account.address : a)) };
    let hash;
    try {
      setState({ status: "pending", scope, label });
      const provider = await connector?.getProvider?.().catch(() => null);
      let from = await ensureAccount(provider, wallet.account.address);
      const { request } = await pc.simulateContract({ ...req, account: from });
      // Mezo's RPC is several nodes behind one URL, and one estimate came back
      // at half the gas the trade needed (found in QA). Never rely on a single
      // estimate: take 2x, with a floor. Gas costs fractions of a cent on Mezo.
      const est = await pc.estimateContractGas({ ...req, account: from });
      const floor = req.functionName === "approve" ? 100_000n : 1_000_000n;
      const gas = est * 2n > floor ? est * 2n : floor;
      try {
        hash = await wallet.writeContract({ ...request, account: from, gas });
      } catch (e) {
        if (!isUnauthorized(e)) throw e;
        // Re-authorize (network + accounts) and retry once, from the same click.
        from = await reauthorize(provider, from);
        hash = await wallet.writeContract({ ...request, account: from, gas });
      }
    } catch (e) {
      // Nothing was sent: wallet rejection or a failed simulation. If the
      // wallet still refuses this site, offer the one-tap reconnect.
      setState({ status: "error", scope, label, error: explain(e), reconnect: isUnauthorized(e) });
      return;
    }

    setState({ status: "mining", scope, label, hash });
    const rc = await waitForReceipt(pc, hash);
    if (!rc) {
      // Sent, but no node has reported it yet. Not a failure.
      setState({ status: "sent", scope, label, hash });
      onDone?.();
      return;
    }
    if (rc.status !== "success") {
      setState({ status: "error", scope, label, hash, error: "The transaction reverted on-chain. Nothing was spent except gas." });
      return;
    }
    setState({ status: "done", scope, label, hash });
    onDone?.();
    return rc;
  }

  function approve(scope, token, spender, label) {
    return send(scope, label, { address: token, abi: ERC20_ABI, functionName: "approve", args: [spender, maxUint256] });
  }

  const busy = state.status === "pending" || state.status === "mining";
  return { state, busy, send, approve, reset: () => setState({ status: "idle" }) };
}
