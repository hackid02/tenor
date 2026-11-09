import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { MAINNET_SMUSD, MEZO_MAINNET_RPC } from "../config";

const ABI = [{ type: "function", name: "yieldIndex", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }];
const client = createPublicClient({ transport: http(MEZO_MAINNET_RPC) });
const DAYS = 7;

/**
 * What sMUSD actually paid on Mezo mainnet over the last 7 days, annualized
 * (simple). sMUSD tracks accrued MUSD per sMUSD in `yieldIndex` (1e18 scale),
 * so the realized rate is the index change over the window.
 */
export function useSmusdRate() {
  return useQuery({
    queryKey: ["smusd-7d"],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const latest = await client.getBlock();
      const probe = await client.getBlock({ blockNumber: latest.number - 10_000n });
      const blockTime = Number(latest.timestamp - probe.timestamp) / 10_000;
      const back = BigInt(Math.round((DAYS * 86400) / blockTime));
      const old = await client.getBlock({ blockNumber: latest.number - back });
      const [now, then] = await Promise.all([
        client.readContract({ address: MAINNET_SMUSD, abi: ABI, functionName: "yieldIndex", blockNumber: latest.number }),
        client.readContract({ address: MAINNET_SMUSD, abi: ABI, functionName: "yieldIndex", blockNumber: old.number }),
      ]);
      const days = Number(latest.timestamp - old.timestamp) / 86400;
      return { apr: (Number(now - then) / 1e18 / days) * 365, days };
    },
  });
}
