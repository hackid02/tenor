import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { maxUint256 } from "viem";
import { ERC20_ABI, mezoTestnet } from "../config";
import { explain } from "../lib/errors";

/** Placeholder in args for the connected wallet's address. */
export const ME = "__ME__";

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
    try {
      setState({ status: "pending", scope, label });
      const { request } = await pc.simulateContract({ ...req, account: wallet.account });
      const gas = await pc.estimateContractGas({ ...req, account: wallet.account });
      const hash = await wallet.writeContract({ ...request, gas: gas * 2n });
      setState({ status: "mining", scope, label, hash });
      const rc = await pc.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("reverted");
      setState({ status: "done", scope, label, hash });
      onDone?.();
      return rc;
    } catch (e) {
      setState((s) => ({ status: "error", scope, label, hash: s.hash, error: explain(e) }));
    }
  }

  function approve(scope, token, spender, label) {
    return send(scope, label, { address: token, abi: ERC20_ABI, functionName: "approve", args: [spender, maxUint256] });
  }

  const busy = state.status === "pending" || state.status === "mining";
  return { state, busy, send, approve, reset: () => setState({ status: "idle" }) };
}
