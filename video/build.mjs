// Renders the film: frames from film.html's seek(t), then voice, sound and captions into one MP4.
//   node build.mjs              # full render to out/tenor-demo.mp4
//   node build.mjs --stills     # contact sheet only (one frame per second of interest)
//   node build.mjs --fps 30 --from 0 --to 20
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const B = (...p) => path.join(HERE, "build", ...p);
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg("fps", 30));
fs.mkdirSync(path.join(HERE, "out"), { recursive: true });

// Data for the page: timeline from the voice-over, element boxes from the captures.
const TL = JSON.parse(fs.readFileSync(B("timeline.json"), "utf8"));
const SHOTS = JSON.parse(fs.readFileSync(B("shots.json"), "utf8"));
fs.writeFileSync(B("data.js"), `window.TL=${JSON.stringify(TL)};window.SHOTS=${JSON.stringify(SHOTS)};`);

const run = (args) => new Promise((res, rej) => { const p = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] }); let err = ""; p.stderr.on("data", (d) => (err += d)); p.on("close", (c) => (c ? rej(new Error(err.slice(-1500))) : res())); });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--allow-file-access-from-files", "--hide-scrollbars", "--font-render-hinting=none"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto("file:///" + path.join(HERE, "film.html").replace(/\\/g, "/") + "?still", { waitUntil: "load" });
await page.evaluate(() => window.ready);
await page.evaluate(() => document.fonts.ready);
const DUR = await page.evaluate(() => window.DURATION);
const CUES = await page.evaluate(() => window.CUES);
const stage = await page.$("#stage");

if (process.argv.includes("--stills")) {
  const times = (arg("times", "") || "").split(",").filter(Boolean).map(Number);
  const list = times.length ? times : TL.lines.flatMap((l) => [l.start + 0.6, (l.start + l.end) / 2, l.end - 0.1]);
  fs.mkdirSync(B("stills"), { recursive: true });
  for (const f of fs.readdirSync(B("stills"))) fs.unlinkSync(B("stills", f));
  let i = 0;
  for (const t of list) {
    await page.evaluate((t) => window.seek(t), t);
    await stage.screenshot({ path: B("stills", `s${String(i++).padStart(3, "0")}.png`) });
  }
  await run(["-y", "-framerate", "1", "-i", B("stills", "s%03d.png"), "-vf", "scale=480:-1,tile=6x" + Math.ceil(list.length / 6), "-frames:v", "1", B("contact.png")]);
  console.log(`contact sheet: ${list.length} frames -> build/contact.png`);
  await browser.close();
  process.exit(0);
}

// ---- Frames ----
const from = Number(arg("from", 0)), to = Number(arg("to", DUR));
const silent = B("silent.mp4");
const ff = spawn(ffmpegPath, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), silent], { stdio: ["pipe", "ignore", "pipe"] });
let fferr = ""; ff.stderr.on("data", (d) => (fferr += d));
const total = Math.round((to - from) * FPS);
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = from + i / FPS;
  await page.evaluate((t) => window.seek(t), t);
  const png = await stage.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % (FPS * 5) === 0) console.log(`frame ${i}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
if (!fs.existsSync(silent)) throw new Error(fferr.slice(-1500));

// ---- Sound: voice lines on the timeline, soft clicks and whooshes, a quiet bed ----
const SR = 48000, N = Math.ceil((DUR + 1) * SR);
const fx = new Float32Array(N);
let seed = 7; const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1);
for (const c of CUES) {
  const s0 = Math.floor(c.t * SR);
  if (c.type === "click") for (let i = 0; i < 0.06 * SR; i++) { const t = i / SR; fx[s0 + i] += (Math.sin(2 * Math.PI * 2100 * t) * 0.5 + noise() * 0.25) * Math.exp(-t * 85) * 0.35; }
  if (c.type === "whoosh") { let lp = 0; for (let i = 0; i < 0.5 * SR; i++) { const t = i / SR; lp += (noise() - lp) * (0.02 + 0.1 * Math.sin(Math.PI * t / 0.5)); fx[s0 + i] += lp * Math.sin(Math.PI * Math.min(1, t / 0.5)) ** 2 * 0.35; } }
}
// Bed: slow, quiet chords (A minor 9 -> F maj7 -> C -> G), soft attack, no drums.
const chords = [[220, 261.63, 329.63, 493.88], [174.61, 220, 261.63, 329.63], [261.63, 329.63, 392, 493.88], [196, 246.94, 293.66, 392]];
const bar = 4.0;
for (let i = 0; i < N; i++) {
  const t = i / SR, ci = Math.floor(t / bar) % 4, u = (t % bar) / bar;
  const env = Math.min(1, u / 0.25) * Math.min(1, (1 - u) / 0.2) * 0.5 + 0.5;
  let v = 0;
  for (const f of chords[ci]) v += Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.08;
  const fade = Math.min(1, t / 2) * Math.min(1, (DUR + 0.5 - t) / 2.5);
  fx[i] += v * env * fade * 0.018;
}
const wav = Buffer.alloc(44 + N * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + N * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fx[i])) * 32767), 44 + i * 2);
fs.writeFileSync(B("fx.wav"), wav);

const inputs = [], delays = [];
TL.lines.forEach((l, i) => { inputs.push("-i", path.join(HERE, l.file)); delays.push(`[${i + 1}:a]adelay=${Math.round(l.start * 1000)}|${Math.round(l.start * 1000)},aformat=channel_layouts=stereo[v${i}]`); });
const n = TL.lines.length;
const graph = `${delays.join(";")};${TL.lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${n}:normalize=0[voice];[voice]acompressor=threshold=-20dB:ratio=3:attack=5:release=120[vc];[${n + 1}:a]aformat=channel_layouts=stereo,volume=0.9[bg];[vc][bg]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]`;
await run(["-y", "-i", silent, ...inputs, "-i", B("fx.wav"), "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-shortest", path.join(HERE, "out", "tenor-demo.mp4")]);
// Captions also as a separate subtitle file (YouTube can use it).
const srtTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
fs.writeFileSync(path.join(HERE, "out", "tenor-demo.srt"), TL.lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}\n`).join("\n"));
console.log(`done: out/tenor-demo.mp4 (${DUR.toFixed(1)}s) and out/tenor-demo.srt in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
