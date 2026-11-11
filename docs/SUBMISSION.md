# AKINDO submission: Tenor (Mezo Buildathon, Wave 2)

Copy each answer into the form. Fill the two `[YOU]` items yourself.

---

**Project name:** Tenor

**Category (3–5 words):** Fixed-rate yield, yield tokenization

**Track:** Track 1: DeFi (Borrowing, Lending, Looping, and Yield)

**Chain deployed on:** Mezo (Mezo Testnet, chain 31611)

**Project status:** Entirely new, built during the Buildathon (Wave 2)

**Project readiness:** Testnet deployment. All contracts verified on the Mezo explorer. Every user action run on-chain (see PROOF.md).

**Links**
- Live app: https://tenorfi.vercel.app
- GitHub: https://github.com/hackid02/tenor
- On-chain proof: https://github.com/hackid02/tenor/blob/main/PROOF.md
- Deck: https://github.com/hackid02/tenor/blob/main/docs/tenor-deck.pdf
- Video (1:35): https://youtu.be/IBrvZi0Eaug

---

**TL;DR (one sentence):**
Tenor splits Mezo's sMUSD savings position into a fixed part (PT) and a variable part (YT), so MUSD holders can lock today's savings rate until a set date, or sell their future yield for MUSD now.

**How it works (problem, solution, MUSD/MEZO):**

*Problem.* Mezo's MUSD Savings Vault (sMUSD) pays a variable rate: about 5% in April, about 13% over the last 7 days on mainnet. Savers can't plan around it, and borrowers who take MUSD at Mezo's fixed 1% can't lock the spread they earn.

*Solution.* Tenor deposits MUSD into Mezo's sMUSD vault and mints two tokens for one maturity date. PT redeems for exactly 1 MUSD at maturity, so buying PT below 1 MUSD fixes your rate. YT receives all the sMUSD yield until maturity, paid in MUSD. PT trades against MUSD in a concentrated-liquidity pool on Mezo Pools, and Tenor's router does every action in one transaction: Fix my yield (buy PT), Sell future yield (keep PT, sell YT), Trade YT, exit early, and redeem at maturity.

*MUSD and Mezo integration.*
- MUSD is the deposit, quote and yield asset.
- Every PT is backed 1:1 by Mezo's sMUSD (MUSDSavingsRate), and YT holders receive its MUSD yield. Tenor handles sMUSD's real behaviour from its verified source: withdraw also pays pending yield, and deposit can trigger a protocol-fee distribution.
- PT liquidity sits in Mezo Pools concentrated-liquidity pools, created through Mezo's CL factory, and the router only accepts those pools.
- The app compares Tenor's fixed rate with what sMUSD actually paid over the last 7 days on Mezo mainnet, read from its yield index.
- Fixed carry: Mezo lends MUSD against BTC at a fixed 1%. Putting it into PT fixes both sides, and the app shows the locked spread. This gives users a reason to borrow more MUSD.

*Business model.* 5% of the sMUSD yield paid to YT, plus any yield after maturity, goes to the protocol treasury. LPs earn pool swap fees.

**Target group:**
MUSD holders who want a predictable return, BTC holders who borrow MUSD on Mezo and want a fixed spread, and DeFi users who want to trade the sMUSD rate (YT) without liquidation risk. Crypto-native users on desktop and mobile web.

**Tech stack:**
Solidity 0.8.24, OpenZeppelin, Hardhat (unit tests plus fork tests against live Mezo Testnet), Mezo sMUSD and Mezo Pools (Slipstream CL), React + Vite, wagmi + viem, Vercel. 29 tests, all passing, including fork tests that check every quote against the router to the wei.

**What was built in this Wave:**
Everything (new project):
- `TenorMarket` (PT/YT split over sMUSD, yield accounting, maturity), `TenorRouter` (one-transaction buy/sell PT, buy/sell YT, cash out yield, through Mezo CL pools)
- deployment of two markets with seeded CL pools; every action run on-chain with explorer links
- the web app with live on-chain data (fixed rate, sMUSD's real 7-day rate, rate history, activity feed)
- `TenorQuoter` (exact on-chain quotes) and Team QA: 8 persona wallets, 23/23 on-chain checks, 10/10 website checks and a final full click-through, 11 bugs found and fixed (https://github.com/hackid02/tenor/blob/main/docs/QA.md)
- outside testers trading on the live app, counted from the chain and listed apart from team wallets (https://github.com/hackid02/tenor/blob/main/docs/USERS.md)
- a design change mid-wave: a Mezo stable pool moved the fixed APY from 11.8% to 2.4% after small trades, so Tenor moved to concentrated liquidity (the same 50 MUSD trade now locks 11.35% against a 12.00% quote). Both sets of transactions are in the proof.

**Future milestones:**
1. **Mainnet launch (by end of December 2026):** capped markets on Mezo sMUSD with one-month and three-month maturities; seed PT liquidity and apply for MEZO gauge incentives on the PT pools.
2. **Borrow-and-fix in one transaction (Q1 2027):** open a Mezo MUSD loan against BTC and lock the sMUSD rate in the same transaction.
3. **PT as collateral (Q1–Q2 2027):** list PT on Mezo's Morpho markets so fixed-rate MUSD can be borrowed against.

**Team:**
[YOU: your name], solo builder: contracts, app and design. X: [YOU: @handle]

---

## 2-minute video script

Record your screen at tenorfi.vercel.app with a wallet connected. Speak plainly. Target 1:50.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:12 | App hero: the fixed APY, the "Tenor fixed vs sMUSD variable" bars | "Mezo's MUSD savings rate moves: about 5% in April, about 13% last week. Tenor lets you lock it." |
| 0:12–0:30 | Scroll to How it works; let the Saver and Trader cursors play | "Tenor puts your MUSD into Mezo's sMUSD vault and splits it in two. PT is worth exactly 1 MUSD at maturity. YT gets all the yield until then." |
| 0:30–0:55 | Fix my yield: type 20, show the quote and chart, click Lock, confirm in the wallet | "Fix my yield: I pay 20 MUSD and get PT. On December 31 it's worth this much, so my rate is fixed right now." |
| 0:55–1:15 | Sell future yield tab: type 50, click, confirm | "Or the opposite: keep my deposit as PT, sell the future yield, and get MUSD today." |
| 1:15–1:30 | Live activity shows your trade; click it to open the Mezo explorer | "Every action is on-chain on Mezo, in one transaction, through Mezo's concentrated-liquidity pools." |
| 1:30–1:45 | Fixed carry card | "And for BTC borrowers: Mezo lends MUSD at a fixed 1%. Put it in PT and the whole spread is fixed." |
| 1:45–1:55 | GitHub README and PROOF.md | "Contracts verified, 29 tests, and every action proven on-chain. That's Tenor: fixed rates for MUSD." |

Checks before uploading: under 2:00, sound clear, wallet balances visible, no private keys or seed phrases on screen.
