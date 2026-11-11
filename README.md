# Tenor

**Fixed rates on Mezo's MUSD Savings Vault.**

Mezo's savings vault (sMUSD) pays a variable rate: about 5% in April 2026, about 13% in the week of Nov 2, 2026. Tenor splits an sMUSD position into two tokens with one maturity date:

- **PT (principal token)** redeems for exactly 1 MUSD at maturity. Buying PT below 1 MUSD locks a fixed rate.
- **YT (yield token)** receives all the sMUSD yield until maturity, paid in MUSD. Selling YT pays that yield up front.

PT trades against MUSD in a concentrated-liquidity pool on Mezo Pools, so every action is one transaction.

> **Live app: [tenorfi.vercel.app](https://tenorfi.vercel.app)** on Mezo Testnet · On-chain proof: [PROOF.md](PROOF.md)

---

## What you can do

| Action | What happens | Contract call |
|---|---|---|
| **Fix my yield** | Pay MUSD, get PT, redeem 1:1 at maturity | `TenorRouter.buyPT` |
| **Sell future yield** | Deposit MUSD, keep the PT, get the YT's value in MUSD now | `TenorRouter.cashOutYield` |
| **Trade YT** | Take (or sell) the variable sMUSD rate, with no liquidation | `TenorRouter.buyYT` / `sellYT` |
| **Exit early** | Sell PT at the pool price | `TenorRouter.sellPT` |
| **Split / merge** | MUSD to PT + YT, or back again, any time | `TenorMarket.deposit` / `redeemPair` |
| **Claim yield** | Collect MUSD earned by YT | `TenorMarket.claimYield` |
| **Redeem** | PT to MUSD, 1:1, after maturity | `TenorMarket.redeemPT` |

**Fixed carry:** Mezo lends MUSD against BTC at a fixed 1%. Put that MUSD into PT and both sides are fixed until maturity. The app shows the locked spread.

## Built on Mezo

| Mezo component | How Tenor uses it |
|---|---|
| **MUSD** | Deposit asset, yield asset, quote asset |
| **sMUSD (MUSDSavingsRate)** | Every PT is backed 1:1 by sMUSD held by the market; YT holders receive its MUSD yield |
| **Mezo Pools, concentrated liquidity** | PT/MUSD pool with liquidity placed in the PT price range (0.01% fee tier) |
| **Mezo Pools CL factory** | The router only trades with pools created by Mezo's factory for that market |
| **Mezo mainnet sMUSD** | The app shows what sMUSD actually paid over the last 7 days, read from its `yieldIndex` |

## Live deployment (Mezo Testnet, chain 31611)

All contracts are verified on the [Mezo testnet explorer](https://explorer.test.mezo.org).

| Contract | Address |
|---|---|
| TenorRouter | [`0xf33CE860f9fDb46E5dA2391a9861Ef3D8c5b2169`](https://explorer.test.mezo.org/address/0xf33CE860f9fDb46E5dA2391a9861Ef3D8c5b2169) |
| TenorQuoter (read-only quotes) | [`0x49651D147fc0a6885910749C67dbc4c92A1e0C28`](https://explorer.test.mezo.org/address/0x49651D147fc0a6885910749C67dbc4c92A1e0C28) |
| TenorMarket, matures Dec 31, 2026 | [`0xfA661547ec7009b4f634A44A02ABA8c20330C607`](https://explorer.test.mezo.org/address/0xfA661547ec7009b4f634A44A02ABA8c20330C607) |
| PT-sMUSD-DEC26 | [`0x3Af12ed51a425A0832cF2807289a75a6B852d4D6`](https://explorer.test.mezo.org/address/0x3Af12ed51a425A0832cF2807289a75a6B852d4D6) |
| YT-sMUSD-DEC26 | [`0x3006ACBDDB0650041ba002F40051441c5d8B7F6b`](https://explorer.test.mezo.org/address/0x3006ACBDDB0650041ba002F40051441c5d8B7F6b) |
| PT/MUSD CL pool (DEC26) | [`0xe800F28a816025a9F806091fD03Bb65F366f4B88`](https://explorer.test.mezo.org/address/0xe800F28a816025a9F806091fD03Bb65F366f4B88) |
| TenorMarket, demo, matures Nov 12, 2026 | [`0x2dfEE93bd2D44CcfFc21F490F4cD20E5b77E9497`](https://explorer.test.mezo.org/address/0x2dfEE93bd2D44CcfFc21F490F4cD20E5b77E9497) |

Every user action has been run on-chain. Transaction links: [PROOF.md](PROOF.md).

## How it works

```
                 ┌──────────────► PT  (1 MUSD at maturity)
MUSD ──► sMUSD ──┤
 (deposit)       └──────────────► YT  (sMUSD yield until maturity)
```

- **`TenorMarket`** (one per maturity) deposits MUSD into sMUSD and mints PT and YT 1:1. It claims sMUSD's MUSD yield and distributes it to YT holders with a per-token accumulator. YT transfers checkpoint both sides first, so yield earned before a transfer stays with the sender.
- **`TenorQuoter`** gives the app exact quotes: it runs the real pool swap and reverts inside the swap callback with the result, so it is correct for any liquidity in the pool and never moves funds. It also reports the largest size the pool can fill.
- **`TenorRouter`** does every trade in one transaction through the PT/MUSD pool's swap callback. Selling YT buys back exactly that much PT, merges PT + YT into MUSD and pays the pool from it. Buying YT sells freshly minted PT into the pool to fund the deposit.
- **Invariant:** `sMUSD.balanceOf(market) == PT.totalSupply()`. PT is always fully backed.

**Fees (the business model):** 5% of the sMUSD yield paid to YT, plus any sMUSD yield that arrives after maturity, go to the protocol treasury. LPs earn the pool's swap fees.

### Design decisions

- **Concentrated liquidity, not a stable pool.** Tenor first used a Mezo stable pool. Those pools hold liquidity at a price of exactly 1, but PT trades at about 0.984, so a few small trades moved the fixed APY from 11.8% to 2.4%. With the same liquidity in a CL range, a 50 MUSD purchase locks 11.35% against a 12.00% quote. The first transactions are kept in [`proof/31611-stable-pool-v1.json`](proof/31611-stable-pool-v1.json).
- **Edge cases from sMUSD's source.** `sMUSD.withdraw` also pays out pending yield, and `sMUSD.deposit` can trigger a protocol-fee distribution. The market harvests in the right order so that yield always goes to the YT holders who earned it. Both cases have tests.
- **Gas.** Gas used on Mezo varies block to block (pool observations, fee distribution inside sMUSD), so the scripts and app double the gas estimate. Gas costs fractions of a cent.

## Try it

A 5-minute guide with free testnet tokens: [docs/TESTING.md](docs/TESTING.md).

Team QA (persona journeys and a full website click-through on Mezo Testnet, with every bug found and fixed): [docs/QA.md](docs/QA.md). QA wallets are labelled "Team QA" in the app and are not counted as users.

Who has used it, read from the chain and split into outside wallets and team wallets: [docs/USERS.md](docs/USERS.md) (`node scripts/users.js`). Tester feedback is public in [GitHub issues](https://github.com/hackid02/tenor/issues?q=label%3A%22tester+feedback%22).

## Tests

```bash
npm install
npm test                # unit tests, mock sMUSD with Mezo's exact yield logic
npm run test:fork       # also runs against a live copy of Mezo Testnet: real sMUSD, real Mezo CL pools
```

22 tests: yield distribution and fees, transfer checkpoints, late depositors, auto-paid yield on withdraw, maturity, a full solvency lifecycle, and every router path (buy and sell PT, cash out yield, buy and sell YT, slippage limits, pool validation, callback protection) on a fork of Mezo Testnet.

## Run it yourself

**Contracts** (Node 20+):

```bash
npm install
cp .env.example .env            # PRIVATE_KEY of a fresh testnet-only wallet
npx hardhat run scripts/whoami.js --network mezoTestnet
npx hardhat run scripts/deploy.js --network mezoTestnet
npx hardhat run scripts/verify.js --network mezoTestnet
npx hardhat run scripts/prove.js  --network mezoTestnet && node scripts/proof-md.js
```

**App:**

```bash
node scripts/export-app.js      # copies ABIs and addresses into app/src/generated
cd app && npm install && npm run dev
```

Deploy the `app` folder on Vercel (framework: Vite). `VITE_SITE_URL` in `app/.env.production` is the public URL used by share cards and the canonical tag. `app/vercel.json` sets security headers. After changing an inline script, run `npm run build && npm run headers`.

## The app

- Quotes come from `TenorQuoter` on-chain, so they match the router to the wei (checked on 12 trades: `scripts/check-quoter.js`). Every trade is also simulated before it is sent, with a slippage limit.
- Mezo's RPC limits log queries to 10,000 blocks, so the app reads history in windows and then only new blocks.
- Live data: the fixed rate, the sMUSD rate on Mezo mainnet over the last 7 days, the rate after every trade, and every Tenor transaction, read directly from the chain.
- No backend, no cookies, no tracking.

## Risks

- The contracts are open source and tested but **not audited**. This deployment is on Mezo Testnet.
- PT is backed 1:1 by sMUSD. If Mezo's sMUSD vault or MUSD fails, PT is affected the same way.
- Selling PT or YT before maturity happens at the pool price, which moves with trades and liquidity.
- YT is worth only the yield sMUSD pays until maturity, which can be zero.

## Roadmap

1. **Mainnet launch with capped markets** on Mezo's sMUSD. Two maturities (one and three months), LP incentives to deepen the PT pools.
2. **Borrow-and-fix in one transaction:** open a Mezo MUSD loan and lock the sMUSD rate together, so the fixed carry is a single click.
3. **PT as collateral:** list PT on Mezo's Morpho markets, so fixed-rate MUSD can be borrowed against.

## License

MIT
