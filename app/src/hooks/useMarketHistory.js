import { useQuery } from "@tanstack/react-query";
import { createPublicClient, decodeFunctionData, formatEther, http, parseAbiItem, parseEventLogs } from "viem";
import { ABI, CHAIN, mezoTestnet } from "../config";
import { apyFromPrice } from "../lib/quote";

const SWAP = parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)");
const INIT = parseAbiItem("event Initialize(uint160 sqrtPriceX96, int24 tick)");
const Q96 = 2 ** 96;
// Own read client: history does not depend on the wallet connection.
// JSON-RPC batching: many lookups go out as one HTTP request.
const client = createPublicClient({ chain: mezoTestnet, transport: http(undefined, { batch: { batchSize: 50, wait: 16 } }) });
const n = (x) => Number(formatEther(x < 0n ? -x : x));

// Mezo's RPC rejects log queries spanning more than 10,000 blocks, so history
// is read in windows. Logs already read are kept; each poll only reads new blocks.
const WINDOW = 9_000n;
const logCache = new Map();

async function logsSince(m) {
  const prev = logCache.get(m.market) || { to: BigInt(m.startBlock) - 1n, logs: [] };
  const latest = await client.getBlockNumber();
  const windows = [];
  for (let from = prev.to + 1n; from <= latest; from += WINDOW) {
    windows.push([from, from + WINDOW - 1n < latest ? from + WINDOW - 1n : latest]);
  }
  // One request per window covers both the pool and the market.
  const chunks = await Promise.all(
    windows.map(([fromBlock, toBlock]) => client.getLogs({ address: [m.pool, m.market], fromBlock, toBlock }))
  );
  const next = { to: latest, logs: prev.logs.concat(chunks.flat()) };
  logCache.set(m.market, next);
  return next.logs;
}

// Transactions and block times never change, so cache them across polls.
const txCache = new Map();
const blockCache = new Map();

function tx(client, hash) {
  if (!txCache.has(hash)) {
    const p = client.getTransaction({ hash });
    p.catch(() => txCache.delete(hash));
    txCache.set(hash, p);
  }
  return txCache.get(hash);
}
function blockTime(client, number) {
  const k = number.toString();
  if (!blockCache.has(k)) {
    const p = client.getBlock({ blockNumber: number }).then((b) => Number(b.timestamp));
    p.catch(() => blockCache.delete(k));
    blockCache.set(k, p);
  }
  return blockCache.get(k);
}

function ptPriceFrom(sqrtPriceX96, ptIs0) {
  const s = Number(sqrtPriceX96) / Q96;
  return ptIs0 ? s * s : 1 / (s * s);
}

/** Describes one router call in plain words, from its decoded arguments and the pool swap. */
function describeRouterCall(fn, args, swap, ptIs0, maturity, ts) {
  const amt = (i) => n(args[i]);
  const ptDelta = swap ? n(ptIs0 ? swap.args.amount0 : swap.args.amount1) : 0;
  switch (fn) {
    case "buyPT": {
      const musdIn = amt(2);
      const apy = ptDelta > 0 ? apyFromPrice(musdIn / ptDelta, maturity - ts) : null;
      return { kind: "fix", title: `Fixed ${fmtN(musdIn)} MUSD`, detail: apy != null ? `at ${(apy * 100).toFixed(2)}%` : "" };
    }
    case "sellPT":
      return { kind: "exit", title: `Sold ${fmtN(amt(2))} PT early`, detail: "" };
    case "cashOutYield":
      return { kind: "cash", title: `Sold future yield on ${fmtN(amt(2))} MUSD`, detail: "" };
    case "buyYT":
      return { kind: "yt", title: `Bought ${fmtN(amt(2))} YT`, detail: "" };
    case "sellYT":
      return { kind: "yt", title: `Sold ${fmtN(amt(2))} YT`, detail: "" };
    default:
      return null;
  }
}

function describeMarketEvent(ev) {
  const a = ev.args;
  switch (ev.eventName) {
    case "Deposited":
      return { kind: "split", title: `Split ${fmtN(n(a.amount))} MUSD into PT + YT`, detail: "" };
    case "PairRedeemed":
      return { kind: "merge", title: `Merged ${fmtN(n(a.amount))} PT + YT`, detail: "" };
    case "PTRedeemed":
      return { kind: "redeem", title: `Redeemed ${fmtN(n(a.amount))} PT for MUSD`, detail: "1:1 at maturity" };
    case "YieldClaimed":
      return n(a.amount) > 0 ? { kind: "claim", title: `Claimed ${fmtN(n(a.amount), 4)} MUSD of yield`, detail: "" } : null;
    default:
      return null;
  }
}

function fmtN(x, d = 2) {
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
}

/**
 * On-chain history of one market: every trade and position change (newest
 * first) and the fixed APY after each trade, from the pool's opening price on.
 */
export function useMarketHistory(m) {
  return useQuery({
    queryKey: ["history", m.market],
    enabled: !!m.startBlock,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      const marketEvents = ABI.market.filter((x) => x.type === "event" && ["Deposited", "PairRedeemed", "PTRedeemed", "YieldClaimed"].includes(x.name));
      const [raw, token0] = await Promise.all([
        logsSince(m),
        client.readContract({ address: m.pool, abi: [{ type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "token0" }),
      ]);
      const from = (a) => raw.filter((l) => l.address.toLowerCase() === a.toLowerCase());
      const poolLogs = from(m.pool);
      const swaps = parseEventLogs({ abi: [SWAP], logs: poolLogs });
      const inits = parseEventLogs({ abi: [INIT], logs: poolLogs });
      const mlogs = parseEventLogs({ abi: marketEvents, logs: from(m.market) });
      const ptIs0 = token0.toLowerCase() === m.pt.toLowerCase();

      // Rate history: opening price, then the price after every swap.
      const points = await Promise.all(
        [...inits, ...swaps].map(async (l) => {
          const ts = await blockTime(client, l.blockNumber);
          const p = ptPriceFrom(l.args.sqrtPriceX96, ptIs0);
          return { ts, apy: apyFromPrice(p, m.maturity - ts), block: l.blockNumber, i: l.logIndex };
        })
      );
      points.sort((a, b) => (a.block === b.block ? a.i - b.i : Number(a.block - b.block)));

      // Activity: one row per transaction.
      const byTx = new Map();
      const add = (hash, item) => {
        if (item && !byTx.has(hash)) byTx.set(hash, item);
      };
      const swapByTx = new Map(swaps.map((s) => [s.transactionHash, s]));
      await Promise.all([...swaps, ...mlogs].flatMap((l) => [tx(client, l.transactionHash), blockTime(client, l.blockNumber)]));
      for (const s of swaps) {
        const t = await tx(client, s.transactionHash);
        if (t.to?.toLowerCase() !== CHAIN.router.toLowerCase()) continue;
        let decoded;
        try {
          decoded = decodeFunctionData({ abi: ABI.router, data: t.input });
        } catch {
          continue;
        }
        const ts = await blockTime(client, s.blockNumber);
        const d = describeRouterCall(decoded.functionName, decoded.args, swapByTx.get(s.transactionHash), ptIs0, m.maturity, ts);
        if (d) add(s.transactionHash, { ...d, hash: s.transactionHash, from: t.from, ts, block: s.blockNumber });
      }
      for (const ev of mlogs) {
        if (byTx.has(ev.transactionHash)) continue; // already described by its router call
        const t = await tx(client, ev.transactionHash);
        if (t.to?.toLowerCase() === CHAIN.router.toLowerCase()) continue; // router internals
        const d = describeMarketEvent(ev);
        if (d) {
          const ts = await blockTime(client, ev.blockNumber);
          add(ev.transactionHash, { ...d, hash: ev.transactionHash, from: t.from, ts, block: ev.blockNumber });
        }
      }
      const activity = [...byTx.values()].sort((a, b) => Number(b.block - a.block)).slice(0, 12);
      return { points, activity, count: byTx.size };
    },
  });
}
