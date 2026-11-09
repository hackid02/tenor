import { useReadContracts, useAccount } from "wagmi";
import { formatEther, maxUint256 } from "viem";
import { ABI, CHAIN, ERC20_ABI, POOL_ABI, mezoTestnet } from "../config";
import { poolView, apyFromPrice } from "../lib/quote";

const num = (x) => (typeof x === "bigint" ? Number(formatEther(x)) : 0);
const ZERO = "0x0000000000000000000000000000000000000001";

/** Live market, pool and wallet state for one Tenor market, in one multicall. */
export function useTenor(marketKey) {
  const m = CHAIN.markets[marketKey];
  const { address } = useAccount();
  const me = address || ZERO;
  const c = (to, abi, functionName, args = []) => ({ address: to, abi, functionName, args, chainId: mezoTestnet.id });

  const { data, refetch, isLoading, isError } = useReadContracts({
    contracts: [
      c(m.pool, POOL_ABI, "slot0"), // 0
      c(m.pool, POOL_ABI, "liquidity"), // 1
      c(m.pool, POOL_ABI, "token0"), // 2
      c(m.market, ABI.market, "isMatured"), // 3
      c(m.market, ABI.market, "previewYield", [me]), // 4
      c(CHAIN.musd, ERC20_ABI, "balanceOf", [me]), // 5
      c(m.pt, ERC20_ABI, "balanceOf", [me]), // 6
      c(m.yt, ERC20_ABI, "balanceOf", [me]), // 7
      c(CHAIN.musd, ERC20_ABI, "allowance", [me, CHAIN.router]), // 8
      c(m.pt, ERC20_ABI, "allowance", [me, CHAIN.router]), // 9
      c(m.yt, ERC20_ABI, "allowance", [me, CHAIN.router]), // 10
      c(m.pt, ABI.token, "totalSupply"), // 11
      c(CHAIN.musd, ERC20_ABI, "balanceOf", [m.pool]), // 12
      c(m.pt, ERC20_ABI, "balanceOf", [m.pool]), // 13
    ],
    query: { refetchInterval: 15_000 },
  });

  const r = (i) => data?.[i]?.result;
  const ready = !!(r(0) && r(1) !== undefined && r(2));
  const view = ready ? poolView({ sqrtPriceX96: r(0)[0], liquidity: r(1), token0: r(2), pt: m.pt, range: m.range }) : null;
  const secondsLeft = Math.max(0, m.maturity - Date.now() / 1000);
  const big = maxUint256 / 2n;

  return {
    m,
    key: marketKey,
    ready,
    isLoading,
    isError,
    refetch,
    view,
    secondsLeft,
    apy: view ? apyFromPrice(view.ptPrice, secondsLeft) : null,
    matured: !!r(3) || secondsLeft <= 0,
    yieldClaimable: num(r(4)),
    musd: num(r(5)),
    pt: num(r(6)),
    yt: num(r(7)),
    raw: { musd: r(5) ?? 0n, pt: r(6) ?? 0n, yt: r(7) ?? 0n },
    approved: {
      musd: (r(8) ?? 0n) > big,
      pt: (r(9) ?? 0n) > big,
      yt: (r(10) ?? 0n) > big,
    },
    tvl: num(r(11)),
    poolMusd: num(r(12)),
    poolPt: num(r(13)),
  };
}
