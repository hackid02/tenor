# Tenor demo film: brief

**One sentence the viewer should remember:** Tenor lets you lock Mezo's moving MUSD savings rate, in one transaction.

- Audience: Mezo Buildathon judges and Mezo users (crypto-native, watching on a laptop or phone)
- Duration: about 1:50 · Format: 16:9, 1920×1080, 30 fps · Voice-over and burned-in captions
- Assets: only real Tenor screens (captured from the app with `shots.mjs`), the real logo (split coin), real on-chain numbers. Never invent screens or metrics.

## Style guide

- Palette: the app's own tokens. Page #f7f7f5, surface #ffffff, ink #15171a, ink-2 #5d636c, line #e3e3de, one accent #0b7a62. No gradients between hues, no glow.
- Type: system UI face (Segoe UI / Inter fallback) for words, ui-monospace for figures and meta. Weights 400–600.
- Motion: closed-form springs. UI moves snap with a hair of overshoot; panels and the camera settle with none; big type arrives fast and holds long enough to read. Something new every 2–4 s.
- Banned: centered title on a gradient, everything fading in, corner labels, frame borders, particles, glow.
- Captions: bottom center, two lines max, the current word in ink and the rest in ink-2, on a quiet surface pill.
- Sound: voice-over first. A quiet synthesized bed under it, soft clicks on cursor clicks, a low whoosh on scene changes.

## Shot list (times come from the voice-over; see `timeline.json`)

| # | Beat | Screen | Purpose |
|---|---|---|---|
| 1 | Hook | The rate as huge kinetic type: 5% (April) morphs to 13% (last week) | The problem in one image |
| 2 | Promise | "Tenor lets you lock it", the split-coin mark assembles | The answer |
| 3 | Concept | MUSD → sMUSD vault → splits into PT (solid half) and YT (dashed half) | How it works, in one diagram |
| 4 | Reveal | Real app hero rises in a browser frame; camera settles on the fixed rate and the fixed-vs-variable bars | It's real and live |
| 5 | Fix my yield | Real trade card: amount typed, quote, chart; cursor clicks Lock; real "Done" status | The main action works |
| 6 | Chart | Push in on the fixed line vs the sMUSD band | Why fixing matters |
| 7 | Sell future yield | Real tab with an amount and its quote | The other side of the market |
| 8 | On-chain | Real Live activity, then the Mezo explorer page of the trade | Every action is on-chain |
| 9 | Real yield | 41.42 MUSD counts up, real claim tx | Real Mezo yield flowed through YT |
| 10 | Carry | Real fixed-carry card | Reason to borrow MUSD |
| 11 | Proof | 8 verified contracts · 29 tests · PROOF.md | Trust |
| 12 | Close | Logo lockup, "Fixed rates for MUSD", tenorfi.vercel.app | Poster frame |
