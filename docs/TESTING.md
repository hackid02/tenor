# Try Tenor on Mezo Testnet (about 5 minutes)

Tenor lets you lock a fixed rate on MUSD, or sell your future yield for MUSD now. Everything here uses free testnet tokens.

**App:** https://tenorfi.vercel.app

## 1. Set up (2 minutes)

1. Use a browser wallet (MetaMask, Rabby, or the Mezo wallet). A fresh wallet is best.
2. Open https://tenorfi.vercel.app and click **Connect wallet**. If asked, approve adding **Mezo Testnet** (chain 31611).
3. Get free test BTC from the faucet: https://faucet.test.mezo.org
4. Get test MUSD: on https://testnet.mezo.org, click **Swap** and swap about **0.002 BTC to MUSD**. Keep a little BTC for gas.

## 2. Try one or two of these

| Try this | Where | What you should see |
|---|---|---|
| **Fix my yield** with 10 MUSD | First tab | You get a bit more than 10 PT, worth 10.xx MUSD on Dec 31 |
| **Sell future yield** on 20 MUSD | Second tab | You keep 20 PT and get some MUSD right away |
| **Buy 20 YT** | Trade YT tab | You pay a small amount of MUSD for 20 YT |

Each action needs an **Approve** first (one time per token), then the action itself.

## 3. Tell us how it went (1 minute)

Fill in the short form: **https://github.com/hackid02/tenor/issues/new?template=tester-feedback.yml** (also linked as **Give feedback** after each trade and in the page footer). Anything confusing, slow or broken counts, even small things.

You don't need to send your wallet address: your transaction shows up in **Live activity** within about 20 seconds, and on our [users page](USERS.md), which is read from the chain.

## If something goes wrong

| You see | Do this |
|---|---|
| "Not enough BTC for gas" | Get more from the faucet. Gas costs a fraction of a cent. |
| "You have no test MUSD" | Swap a little BTC to MUSD on testnet.mezo.org (step 1.4). |
| The trade says "Sent" but not "Done" | Mezo's RPC can lag. Click **Explorer**; it usually confirms within a minute. |
| Your wallet shows a high gas limit | Normal. Tenor sets a generous limit because Mezo's estimates vary; you only pay for gas actually used. |

Thank you!
