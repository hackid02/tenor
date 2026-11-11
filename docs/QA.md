# Tenor QA report

**These are team-run tests, not users.** Every wallet below was created and funded by the Tenor team for QA. The app labels them "Team QA" in Live activity, and they are not counted as outside users.

## Persona journeys on Mezo Testnet

Run 2026-11-11 12:36 UTC with `scripts/qa-personas.js`: **23 of 23 checks passed.**

| | Persona | Check | Result | Tx |
|---|---|---|---|---|
| ✅ | Ada | Fix my yield: 50 MUSD gets the quoted PT | quoted 50.5027 PT, got 50.5027 PT, 7.66% fixed | [link](https://explorer.test.mezo.org/tx/0x01287a82a32f8264ab9085124513242e6f17362c994e28f4eaef8d688400ba8d) |
| ✅ | Ada | Holding PT, no MUSD stuck in router | router MUSD balance 0 |  |
| ✅ | Bayo | Sell future yield on 100 MUSD: keeps 100 PT | PT 100.00 | [link](https://explorer.test.mezo.org/tx/0x73d7269f4508d96249885fe52e5ae220467812183bcb2d9f2fb694d82dc6aab1) |
| ✅ | Bayo | Gets about the quoted MUSD up front | quoted 0.9087, got 0.9087 MUSD |  |
| ✅ | Bayo | Has no YT left (yield sold) | YT 0 |  |
| ✅ | Chidi | Buy 30 YT for about the quoted cost | quoted 0.2664, paid 0.2664 MUSD for 30 YT | [link](https://explorer.test.mezo.org/tx/0xf47b18103b12a9ffd701a5ae45e18f78a79cb632f11814ee469bb818b2185c98) |
| ✅ | Chidi | Claim yield works with nothing accrued yet | claimed 0, no revert | [link](https://explorer.test.mezo.org/tx/0xc25e0a3a45acc2481fc03d71fd10391ca33aae67d6726ab030b1cb61ec5b8855) |
| ✅ | Chidi | Sell 10 YT back for about the quoted MUSD | quoted 0.0880, got 0.0880 MUSD, 20 YT left | [link](https://explorer.test.mezo.org/tx/0xeaee6bbf13c72721f6c0dbb8eebf3a361b272d75a40e9422477274c357fbd211) |
| ✅ | Dami | Buy 30 MUSD of PT, then sell it all straight back | got back 29.9940 of 30 MUSD (round-trip cost 0.01%) | [link](https://explorer.test.mezo.org/tx/0x55d483002b369dd6d5f5907830f2d8f167d02dc5d4664161d58c6c69033b5e6a) |
| ✅ | Dami | Round trip costs under 0.5% (fees and price impact) | 0.01% |  |
| ✅ | Efe | Split 20 MUSD into 20 PT + 20 YT | 20 PT + 20 YT | [link](https://explorer.test.mezo.org/tx/0xad7f63d1390d55b1a48f6bc19e2a912dfc67d52c7e0c9b6b594fb07b2f545bb9) |
| ✅ | Efe | Send 5 YT to Ada (yield checkpoint on transfer) | 15 YT left | [link](https://explorer.test.mezo.org/tx/0x9d0f695d276b742864a41564aa8a3f8017932e947bcb2bf81289eef788aaefdb) |
| ✅ | Efe | Merge 10 PT + 10 YT back into exactly 10 MUSD | 10.0000 MUSD | [link](https://explorer.test.mezo.org/tx/0xbcc32a63310a019bc314db99924866aa380561ca6ee706a6ee38963eb6862d7e) |
| ✅ | Efe | Invariant: market's sMUSD equals PT supply | 1272.00 PT = 1272.00 sMUSD |  |
| ✅ | Funmi | Fix yield without approving MUSD | reverted with ERC20InsufficientAllowance |  |
| ✅ | Funmi | Fix yield with more MUSD than she has | reverted with ERC20InsufficientBalance |  |
| ✅ | Funmi | Impossible minimum (slippage guard) | reverted with Slippage |  |
| ✅ | Funmi | Sell PT she doesn't have | reverted with ERC20InsufficientBalance |  |
| ✅ | Funmi | Zero amount | reverted with ZeroAmount |  |
| ✅ | Funmi | Pass a fake pool | reverted |  |
| ✅ | Funmi | Redeem PT before maturity | reverted with NotMatured |  |
| ✅ | Funmi | Call the swap callback directly | reverted with UnauthorizedCallback |  |
| ✅ | Funmi | Quote for 100,000 MUSD reports a partial fill (app shows the limit) | pool can take 800.58 MUSD |  |

## Website end to end

Gina, a Team QA persona with a throwaway test wallet, clicked through the real Tenor interface (local build of the same code as the live site) against Mezo Testnet. **10 of 10 checks passed.**

| | Step | Result |
|---|---|---|
| ✅ | Connect wallet from the header (EIP-6963 wallet picker) | connected; header shows 0x66F1…5A00 |
| ✅ | Enter 10 MUSD in Fix my yield | balance 15.00 MUSD shown; quote 10.0876 PT at 6.65%; button asks to Approve MUSD |
| ✅ | Approve MUSD | Confirm → Waiting → Done; 100,000 gas floor; [tx](https://explorer.test.mezo.org/tx/0x0eea5fe3f1a9a9546e56b152bee1c2d533b57b7855ecb74ca6652bc8d8ee2cff) |
| ✅ | Lock 6.65% until Dec 31, 2026 | received exactly the quoted 10.0876 PT; 1,000,000 gas floor; [tx](https://explorer.test.mezo.org/tx/0x33ca968a3ae219420024b00a18eb8c6a2bca708d5acac52c33b9349d28dbf2f3) |
| ✅ | Position card and Live activity update | PT 10.0876, MUSD 5.00; trade listed as "You" (others see Team QA · Gina) |
| ✅ | Approve PT, then Sell PT early | sold 10.0876 PT for 9.998 MUSD; [approve](https://explorer.test.mezo.org/tx/0xd3c32f5bdd08b60a6fc929565c5b9b5969228bf40b70c11a706429f6e068e5e1) · [sell](https://explorer.test.mezo.org/tx/0x2be147ef8a284e221da2807079a004eb23d959b3c1f45106b2e62f378fc7f50a) |
| ✅ | Round trip cost | 15.000 → 14.998 MUSD (0.01%) |
| ✅ | Enter more than the balance (50 MUSD) | "You have 15.00 MUSD."; button disabled as "Not enough MUSD" |
| ✅ | Disconnect | back to Connect wallet; position card asks to connect |
| ✅ | Bug found: Approve PT button waited for the sell price to load | fixed: approving no longer needs a price |

## Bugs found by testing, and fixed

| Found by | Problem | Fix |
|---|---|---|
| First real wallet trade on the live site | The app said "receipt not found" for a trade that had succeeded: Mezo's RPC nodes can lag the node that accepted it | Poll for up to 3 minutes; report failure only for a reverted receipt |
| Same trade | PT above 1 MUSD near maturity showed a negative fixed APY | Show "No fixed yield now" and explain why |
| Persona QA (Dami) | A sell ran out of gas: one RPC node estimated half the gas actually needed | Gas floor of 1,000,000 for trades (100,000 for approvals); costs fractions of a cent |
| Website QA (Gina) | "Approve PT" stayed disabled until an unrelated sell price loaded | Approving no longer waits for a price |
| Live site, day 2 | Activity feed failed once markets passed 10,000 blocks (RPC log-range limit) | Read history in 9,000-block windows, then only new blocks |
| Final website check (Hana) | On a market where PT trades above 1 MUSD, Buy YT showed a cost of 0 and a negative break-even, and the router would revert | Buy YT is blocked with a plain explanation when PT is at or above 1 MUSD |
| Final website check (Hana) | Dust amounts (0.0000001 MUSD) could be submitted, and leading zeros stayed in the field | Minimum trade 0.01; leading zeros removed |
| Outside testers on MetaMask mobile | After a reload, the wallet looked connected but refused the first transaction: "The requested method and/or account has not been authorized" (EIP-1193 4100). Reconnecting fixed it | Before sending, the app checks the wallet still lists the account; on 4100 it asks the wallet to authorize again and retries, from the same click. Tested with a wallet that reproduces the 4100 state |
| Rate history on the demo market | A PT price above 1 MUSD drew a fixed APY of -13.44% | Shown as "none", matching the headline |

## Final website check (Nov 11)

A fresh Team QA wallet (Hana) ran every flow through the real UI on localhost against Mezo Testnet: connect, approve MUSD, Fix my yield (3 MUSD), Sell future yield (2 MUSD), Buy YT and Sell YT (2 YT), approve PT and Sell PT early. **All passed**; 10 MUSD in, 9.9986 MUSD out after the round trip. Amount field edge cases (empty, 0, letters, negative, too large for the pool, over balance) and the demo market were also checked; the bugs found are in the table above. The full test suite passed (29 of 29, fork tests on a copy of Mezo Testnet), the production build runs with its security headers without console errors, and every link in the docs and app resolves.

## Team QA wallets

| Address | Persona |
|---|---|
| `0x8ca89B81655672F1e9322562AFf80e2a81Fe2BAA` | Ada (saver) |
| `0x5a3cb4C9E1Ed662FAee304134581243B9C3027ec` | Bayo (yield seller) |
| `0xD77369d29d57e746155fef09BBC577F9459f172C` | Chidi (YT trader) |
| `0xAa1B7e7dabF539ABf0298816E3904Da42e031adb` | Dami (early exit) |
| `0x7Eff3D57f8Ae05f4a9706E1aC71c043C428B7F9b` | Efe (split and merge) |
| `0x922147356dbE89dAc23dc0A0131AA02B46A96dec` | Funmi (edge cases) |
| `0x66F18163D75E2848cE41fFDFF0e7455b46475A00` | Gina (website tester) |
| `0xA81C4bD4259A7766d3d749Df40991B96ac272562` | Run-1 (first QA run, saver or yield seller) |
| `0x5d905B6b478e1aDf751f627dF9e06795e7B9B6d9` | Run-1 (first QA run, saver or yield seller) |
| `0x29F6C316119cdc832dEAB87B7b119ea8E4b966dD` | Run-1 (first QA run, YT trader) |
| `0x1D52791aCB2FCA1afD725733621595BE0aD44A2e` | Run-1 (first QA run, early exit; hit the gas bug) |
| `0x73D34E243BE04aDc3f9CAe5d86B35530a45d05Ac` | Hana (final website check) |
| `0x61477A660387ac917830a8Ca66e3f1B89460361a` | Demo film wallet |
