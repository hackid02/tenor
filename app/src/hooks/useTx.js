import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
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
  const [state, setState] = useState({ status: "idle" });

  async function send(scope, label, rawReq) {
    if (!wallet) return;
    const req = { ...rawReq, args: (rawReq.args || []).map((a) => (a === ME ? wallet.account.address : a)) };
    let hash;
    try {
      setState({ status: "pending", scope, label });
      const { request } = await pc.simulateContract({ ...req, account: wallet.account });
      const gas = await pc.estimateContractGas({ ...req, account: wallet.account });
      hash = await wallet.writeContract({ ...request, gas: gas * 2n });
    } catch (e) {
      // Nothing was sent: wallet rejection or a failed simulation.
      setState({ status: "error", scope, label, error: explain(e) });
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
