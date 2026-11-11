// Captures the real Tenor screens used in the film, from the live site.
//   node shots.mjs plain   # screens that need no wallet
//   node shots.mjs trade   # a real trade with the demo wallet (Team QA)
// Saves PNGs at 2x plus build/shots.json with element boxes (in CSS px,
// relative to each shot) so the film can aim its camera and cursor.
import puppeteer from "puppeteer-core";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const OUT = path.join(HERE, "build", "shots");
fs.mkdirSync(OUT, { recursive: true });
const SITE = process.env.SITE || "https://tenorfi.vercel.app";
const RPC = "https://rpc.test.mezo.org";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const META = path.join(HERE, "build", "shots.json");
const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, "utf8")) : {};
const save = () => fs.writeFileSync(META, JSON.stringify(meta, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = process.argv[2] || "plain";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }]);

// Demo wallet: a throwaway testnet key kept in build/.demo-key (git-ignored).
let wallet;
if (mode === "trade") {
  const keyFile = path.join(HERE, "build", ".demo-key");
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, ethers.Wallet.createRandom().privateKey);
  wallet = new ethers.Wallet(fs.readFileSync(keyFile, "utf8").trim(), new ethers.JsonRpcProvider(RPC, 31611, { staticNetwork: true }));
  meta.demoWallet = wallet.address;
  save();
  await page.exposeFunction("__demoSend", async (tx) => {
    const sent = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, gasLimit: tx.gas ? BigInt(tx.gas) : undefined });
    return sent.hash;
  });
  await page.evaluateOnNewDocument((address, rpcUrl) => {
    const rpc = async (method, params) => {
      const r = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || [] }) }).then((x) => x.json());
      if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code, data: r.error.data });
      return r.result;
    };
    const provider = {
      async request({ method, params }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x7b7b";
        if (method === "net_version") return "31611";
        if (method.startsWith("wallet_")) return method.includes("Permissions") ? [{ parentCapability: "eth_accounts" }] : null;
        if (method === "eth_sendTransaction") return window.__demoSend(params[0]);
        return rpc(method, params);
      },
      on() {},
      removeListener() {},
    };
    const info = { uuid: "demo-wallet", name: "Demo wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "app.tenor.demo" };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    window.ethereum = provider;
    announce();
  }, wallet.address, RPC);
}

async function boxes(root, sels) {
  return page.evaluate(
    (root, sels) => {
      const r0 = document.querySelector(root).getBoundingClientRect();
      const out = { w: r0.width, h: r0.height };
      for (const [k, s] of Object.entries(sels)) {
        const el = typeof s === "string" ? document.querySelector(s) : null;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out[k] = { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height };
      }
      return out;
    },
    root,
    sels
  );
}

async function shotEl(name, sel, sels = {}) {
  const el = await page.$(sel);
  await el.scrollIntoView();
  await sleep(700);
  await el.screenshot({ path: path.join(OUT, name + ".png") });
  meta[name] = await boxes(sel, sels);
  save();
  console.log("shot", name);
}

const tab = (name) =>
  page.evaluate((n) => [...document.querySelectorAll(".tabs button, [role=tab]")].find((b) => b.textContent.trim() === n).click(), name);
async function typeAmount(v) {
  const inp = await page.$(".trade input");
  await inp.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (v) await inp.type(String(v), { delay: 60 });
}
const waitQuote = () =>
  page.waitForFunction(() => [...document.querySelectorAll(".trade button.btn.primary")].some((b) => !/Getting the price|Enter an amount/.test(b.textContent)), { timeout: 30000 }).then(() => sleep(1500));
async function waitDone(label) {
  await page.waitForFunction((l) => [...document.querySelectorAll(".status")].some((s) => /done|error/.test(s.className) && s.textContent.includes(l)), { timeout: 200000 }, label);
  return page.evaluate(() => document.querySelector(".status a")?.href || null);
}
const TRADE = { input: ".trade input", button: ".trade button.btn.primary", chart: ".trade .fixchart", status: ".trade .status", rows: ".trade .rows, .trade .quote" };

await page.goto(SITE, { waitUntil: "networkidle2", timeout: 90000 });
// Wait for every live number: rate history, sMUSD's mainnet rate, the activity feed.
await page.waitForFunction(
  () => !!document.querySelector(".history svg") && !!document.querySelector(".act-item") && /[0-9]%/.test(document.querySelector(".compare")?.innerText || "") && !(document.querySelector(".compare")?.innerText || "…").includes("…"),
  { timeout: 120000 }
);
await sleep(3000);

if (mode === "plain") {
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, "hero.png") });
  meta.hero = await page.evaluate(() => {
    const b = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height }; };
    return { w: innerWidth, h: innerHeight, rate: b(".market h1"), compare: b(".compare"), trade: b(".trade"), history: b(".history") };
  });
  save();
  console.log("shot hero");
  await shotEl("history", ".market-facts", { chart: ".history", compare: ".compare" });
  await typeAmount(100);
  await waitQuote();
  await page.waitForSelector(".trade .lg-band", { timeout: 60000 });
  // Hover the fixed-return chart halfway along for the tooltip.
  const c = await page.$(".trade .chart-plot");
  await c.scrollIntoView();
  const bb = await c.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.48, bb.y + bb.height * 0.5);
  await sleep(600);
  await shotEl("chart-hover", ".trade", TRADE);
  await page.mouse.move(5, 5);
  await tab("Sell future yield");
  await typeAmount(50);
  await waitQuote();
  await shotEl("sell", ".trade", TRADE);
  await shotEl("how", ".how", {});
  const carry = await page.evaluateHandle(() => document.querySelector("#carry-title")?.closest("section"));
  if (carry) {
    await page.evaluate((el) => el.setAttribute("data-shot", "carry"), carry);
    await shotEl("carry", "[data-shot=carry]", {});
  }
  // Pages outside the app: the proof and the Mezo explorer.
  await page.goto("https://github.com/hackid02/tenor/blob/main/PROOF.md", { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, "proof.png") });
  console.log("shot proof");
  const proof = JSON.parse(fs.readFileSync(path.join(HERE, "..", "proof", "31611.json"), "utf8"));
  const claim = proof.steps.find((s) => s.action === "claimYield");
  if (claim) {
    await page.goto(claim.link, { waitUntil: "networkidle2", timeout: 90000 });
    await sleep(5000);
    await page.screenshot({ path: path.join(OUT, "claim-tx.png") });
    meta.claimTx = claim.tx;
    save();
    console.log("shot claim-tx");
  }
}

if (mode === "trade") {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Connect wallet/.test(b.textContent))?.click());
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Demo wallet/.test(b.textContent))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Disconnect"), { timeout: 30000 });
  await sleep(3000);
  const amt = process.env.AMOUNT || "10";
  await typeAmount("");
  await sleep(800);
  await shotEl("fix-empty", ".trade", TRADE);
  await typeAmount(amt);
  await waitQuote();
  await shotEl("fix-typed", ".trade", TRADE);
  const label = await page.$eval(".trade button.btn.primary", (b) => b.textContent);
  if (/Approve/.test(label)) {
    await page.click(".trade button.btn.primary");
    await waitDone("Approve");
    await sleep(2500);
    await shotEl("fix-approved", ".trade", TRADE);
  }
  await page.click(".trade button.btn.primary");
  await page.waitForFunction(() => document.querySelector(".trade .status")?.className.includes("pending") || document.querySelector(".trade .status")?.className.includes("mining"), { timeout: 30000 });
  await shotEl("fix-pending", ".trade", TRADE);
  const link = await waitDone("Lock");
  await sleep(1500);
  await shotEl("fix-done", ".trade", TRADE);
  meta.fixTx = link;
  save();
  console.log("fix tx", link);
  // Let the activity feed pick the trade up, then capture it.
  await sleep(30000);
  await shotEl("activity", ".activity", { first: ".act-item" });
  const pos = await page.evaluateHandle(() => document.querySelector("#pos-title")?.closest("section"));
  await page.evaluate((el) => el.setAttribute("data-shot", "position"), pos);
  await shotEl("position", "[data-shot=position]", {});
  if (link) {
    await page.goto(link, { waitUntil: "networkidle2", timeout: 90000 });
    await sleep(5000);
    await page.screenshot({ path: path.join(OUT, "fix-tx.png") });
    console.log("shot fix-tx");
  }
}

await browser.close();
