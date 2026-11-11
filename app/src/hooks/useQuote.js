import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createPublicClient, formatEther, http } from "viem";
import { ABI, CHAIN, mezoTestnet } from "../config";
import { toWei } from "../lib/format";
import { apyFromPrice } from "../lib/quote";

const client = createPublicClient({ chain: mezoTestnet, transport: http(undefined, { batch: { wait: 16 } }) });
const n = (x) => Number(formatEther(x));

/** sqrtPriceX96 for a PT price, so simulated swaps stop at a realistic bound. */
function limitAt(ptPrice, ptIs0) {
  const poolPrice = ptIs0 ? ptPrice : 1 / ptPrice;
  return BigInt(Math.floor(Math.sqrt(poolPrice) * 2 ** 52)) << 44n;
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Exact quote for a Tenor trade from TenorQuoter, which simulates the real
 * pool swap against whatever liquidity the pool holds. `max` is the largest
 * size the pool can fill right now, reported when `ok` is false.
 *
 * kinds: fix (MUSD in), cash (MUSD in), buyYT (YT out), sellYT (YT in), sellPT (PT in)
 */
export function useQuote(t, kind, input) {
  const settled = useDebounced(input, 250);
  const wei = toWei(settled);
  const q = useQuery({
    queryKey: ["quote", t.m.pool, kind, settled],
    enabled: t.ready && !!wei && !!CHAIN.quoter,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
    queryFn: async () => {
      const up = limitAt(1.01, t.view.ptIs0); // PT bought: price rises
      const down = limitAt(0.8, t.view.ptIs0); // PT sold: price falls
      const call = (fn, amount, limit) =>
        client
          .simulateContract({ address: CHAIN.quoter, abi: ABI.quoter, functionName: fn, args: [t.m.pool, t.m.pt, amount, limit] })
          .then((r) => r.result);
      const a = n(wei);
      // PT at or above 1 MUSD: nothing to fix or sell at any size.
      const flat = t.view.ptPrice >= 0.9999;
      switch (kind) {
        case "fix": {
          const r = await call("quoteBuyPT", wei, up);
          const pt = n(r.amountOut);
          return { ok: r.filled && pt > a, noGain: flat || (r.filled && pt <= a), pt, gain: pt - a, apy: apyFromPrice(a / pt, t.secondsLeft), max: n(r.amountIn) };
        }
        case "cash": {
          const r = await call("quoteExactPT", wei, up);
          const cost = n(r.amountIn);
          return { ok: r.filled && cost < a, noGain: flat || (r.filled && cost >= a), now: Math.max(0, a - cost), pt: a, max: n(r.amountOut) };
        }
        case "buyYT": {
          const r = await call("quoteSellPT", wei, down);
          // PT selling for 1 MUSD or more would make YT cost nothing or less:
          // the router cannot settle that trade, so it is not offered.
          const noYT = flat || (r.filled && n(r.amountOut) >= a);
          return { ok: r.filled && !noYT, noYT, cost: Math.max(0, a - n(r.amountOut)), max: n(r.amountIn) };
        }
        case "sellYT": {
          const r = await call("quoteExactPT", wei, up);
          const cost = n(r.amountIn);
          return { ok: r.filled && cost < a, noGain: flat || (r.filled && cost >= a), out: Math.max(0, a - cost), max: n(r.amountOut) };
        }
        case "sellPT": {
          const r = await call("quoteSellPT", wei, down);
          return { ok: r.filled, out: n(r.amountOut), max: n(r.amountIn) };
        }
        default:
          throw new Error(`unknown quote ${kind}`);
      }
    },
  });
  const current = settled === input && !q.isPlaceholderData;
  return { data: wei ? q.data : undefined, current, error: q.isError };
}
