// Lists every wallet that has used Tenor, read straight from the chain, and
// separates outside wallets from the team's own. Writes docs/USERS.md.
//   node scripts/users.js
// Nobody has to send in an address: any wallet that trades through the router
// or calls a market shows up here.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const ADDR = require("./lib/addresses");

const cid = 31611;
const A = ADDR[cid];
const root = path.join(__dirname, "..");
const dep = JSON.parse(fs.readFileSync(path.join(root, "deployments", `${cid}.json`), "utf8"));
const qa = JSON.parse(fs.readFileSync(path.join(root, "qa", "wallets.json"), "utf8"));
const rpc = new ethers.JsonRpcProvider(A.rpc || "https://rpc.test.mezo.org", cid, { staticNetwork: true, batchMaxCount: 20 });

const label = {};
for (const m of Object.values(dep.markets)) if (m.treasury) label[m.treasury.toLowerCase()] = "Team";
for (const [a, n] of Object.entries(qa)) label[a.toLowerCase()] = `Team QA · ${n.split(" ")[0]}`;

const routerAbi = JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts/TenorRouter.sol/TenorRouter.json"), "utf8")).abi;
const marketAbi = JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts/TenorMarket.sol/TenorMarket.json"), "utf8")).abi;
const routerI = new ethers.Interface(routerAbi);
const marketI = new ethers.Interface(marketAbi);
const ACTIONS = { buyPT: "Fix yield", sellPT: "Sell PT", cashOutYield: "Sell future yield", buyYT: "Buy YT", sellYT: "Sell YT", deposit: "Split", redeemPair: "Merge", redeemPT: "Redeem PT", claimYield: "Claim yield" };

const WINDOW = 9_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

async function main() {
  const latest = await retry(() => rpc.getBlockNumber());
  const hashes = new Set();
  for (const [key, m] of Object.entries(dep.markets)) {
    const rc = await retry(() => rpc.getTransactionReceipt(m.deployTx));
    const start = rc ? rc.blockNumber : latest - 200_000;
    for (let from = start; from <= latest; from += WINDOW) {
      const to = Math.min(from + WINDOW - 1, latest);
      const logs = await retry(() => rpc.getLogs({ address: [m.market, m.pool].filter(Boolean), fromBlock: from, toBlock: to }));
      logs.forEach((l) => hashes.add(l.transactionHash));
    }
    console.log(`${key}: scanned blocks ${start}–${latest}`);
  }

  const router = dep.router.toLowerCase();
  const markets = new Map(Object.values(dep.markets).map((m) => [m.market.toLowerCase(), m.label]));
  const wallets = new Map();
  const list = [...hashes];
  for (let i = 0; i < list.length; i += 20) {
    const txs = await Promise.all(list.slice(i, i + 20).map((h) => retry(async () => (await rpc.getTransaction(h)) || Promise.reject(new Error("tx not found yet")))));
    for (const t of txs) {
      if (!t?.to) continue;
      const to = t.to.toLowerCase();
      let fn;
      try {
        if (to === router) fn = routerI.parseTransaction({ data: t.data })?.name;
        else if (markets.has(to)) fn = marketI.parseTransaction({ data: t.data })?.name;
      } catch {}
      if (!fn || !ACTIONS[fn]) {
        if (process.env.DEBUG) console.log("skip", to.slice(0, 10), fn || t.data.slice(0, 10));
        continue; // pool seeding, harvests, etc.
      }
      const a = t.from.toLowerCase();
      const w = wallets.get(a) || { address: t.from, actions: {}, txs: [], first: Infinity };
      w.actions[ACTIONS[fn]] = (w.actions[ACTIONS[fn]] || 0) + 1;
      w.txs.push({ hash: t.hash, block: t.blockNumber, fn: ACTIONS[fn] });
      w.first = Math.min(w.first, t.blockNumber);
      wallets.set(a, w);
    }
  }

  const all = [...wallets.values()].sort((x, y) => x.first - y.first);
  const outside = all.filter((w) => !label[w.address.toLowerCase()]);
  const team = all.filter((w) => label[w.address.toLowerCase()]);
  const count = (ws) => ws.reduce((s, w) => s + w.txs.length, 0);
  const tx = (h) => `[${h.slice(0, 10)}…](${A.explorer}/tx/${h})`;
  const acts = (w) => Object.entries(w.actions).map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(", ");

  const L = [];
  L.push("# Who has used Tenor");
  L.push("");
  L.push(`Read from ${A.name} at block ${latest} by \`node scripts/users.js\`. Every wallet that traded through \`TenorRouter\` or called a \`TenorMarket\` is listed. Approvals and pool seeding are not counted.`);
  L.push("");
  L.push("| | Wallets | Transactions |");
  L.push("|---|---|---|");
  L.push(`| **Outside wallets** (not on the team or QA list) | **${outside.length}** | **${count(outside)}** |`);
  L.push(`| Team and Team QA wallets ([docs/QA.md](QA.md)) | ${team.length} | ${count(team)} |`);
  L.push("");
  L.push("## Outside wallets");
  L.push("");
  if (!outside.length) L.push("None yet.");
  else {
    L.push("| Wallet | What they did | First transaction |");
    L.push("|---|---|---|");
    for (const w of outside) {
      const firstTx = w.txs.sort((a, b) => a.block - b.block)[0];
      L.push(`| [\`${w.address}\`](${A.explorer}/address/${w.address}) | ${acts(w)} | ${tx(firstTx.hash)} |`);
    }
  }
  L.push("");
  L.push("## Team wallets");
  L.push("");
  L.push("| Wallet | Label | What they did |");
  L.push("|---|---|---|");
  for (const w of team) L.push(`| \`${w.address}\` | ${label[w.address.toLowerCase()]} | ${acts(w)} |`);
  L.push("");
  fs.writeFileSync(path.join(root, "docs", "USERS.md"), L.join("\n"));
  console.log(`outside wallets: ${outside.length} (${count(outside)} txs); team: ${team.length} (${count(team)} txs)`);
  console.log("docs/USERS.md written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
