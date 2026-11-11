# Tenor demo film

A 1:35 product film rendered from code: every frame is `seek(t)` in `film.html`, captured in headless Chrome and encoded with ffmpeg. Voice-over by a neural voice, captions timed to each spoken word.

- `brief.md`: what the viewer should remember, the style guide and the shot list
- `script.json`: the voice-over lines and pauses
- `shots.mjs`: captures the real Tenor screens from the live site (`plain`), and a real trade with a Team QA demo wallet (`trade`)
- `voice.py`: voice-over audio and word timings, then `build/timeline.json`
- `film.html`: the composition, a pure function of time (open it in a browser to preview)
- `build.mjs`: contact sheet (`--stills`) or the full render to `out/tenor-demo.mp4` and `out/tenor-demo.srt`

```bash
npm install
python -m pip install edge-tts
node shots.mjs plain
AMOUNT=10 node shots.mjs trade   # needs the demo wallet funded with test MUSD
python voice.py
node build.mjs --stills
node build.mjs
```

Only real product screens and real on-chain numbers are used. `build/` and `out/` are not committed; the demo wallet key lives in `build/.demo-key`.
