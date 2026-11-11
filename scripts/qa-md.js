// Builds docs/QA.md from qa/last-run.json (persona QA) and qa/ui-run.json (UI test).
//   node scripts/qa-md.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (f) => (fs.existsSync(path.join(root, f)) ? JSON.parse(fs.readFileSync(path.join(root, f), "utf8")) : null);
const run = read("qa/last-run.json");
const ui = read("qa/ui-run.json");
const wallets = read("qa/wallets.json") || {};

const L = [];
L.push("# Tenor QA report");
L.push("");
L.push("**These are team-run tests, not users.** Every wallet below was created and funded by the Tenor team for QA. The app labels them \"Team QA\" in Live activity, and they are not counted as outside users.");
L.push("");
if (run) {
  const pass = run.results.filter((r) => r.pass).length;
  L.push(`## Persona journeys on ${run.network}`);
  L.push("");
  L.push(`Run ${run.time.slice(0, 16).replace("T", " ")} UTC with \`scripts/qa-personas.js\`: **${pass} of ${run.results.length} checks passed.**`);
  L.push("");
  L.push("| | Persona | Check | Result | Tx |");
  L.push("|---|---|---|---|---|");
  for (const r of run.results) {
    L.push(`| ${r.pass ? "✅" : "❌"} | ${r.persona} | ${r.check} | ${r.detail || ""} | ${r.tx ? `[link](${r.tx})` : ""} |`);
  }
  L.push("");
}
if (ui) {
  const pass = ui.results.filter((r) => r.pass).length;
  L.push("## Website end to end");
  L.push("");
  L.push(`${ui.note} **${pass} of ${ui.results.length} checks passed.**`);
  L.push("");
  L.push("| | Step | Result |");
  L.push("|---|---|---|");
  for (const r of ui.results) L.push(`| ${r.pass ? "✅" : "❌"} | ${r.step} | ${r.detail || ""} |`);
  L.push("");
}
L.push("## Bugs found by testing, and fixed");
L.push("");
L.push("| Found by | Problem | Fix |");
L.push("|---|---|---|");
L.push("| First real wallet trade on the live site | The app said \"receipt not found\" for a trade that had succeeded: Mezo's RPC nodes can lag the node that accepted it | Poll for up to 3 minutes; report failure only for a reverted receipt |");
L.push("| Same trade | PT above 1 MUSD near maturity showed a negative fixed APY | Show \"No fixed yield now\" and explain why |");
L.push("| Persona QA (Dami) | A sell ran out of gas: one RPC node estimated half the gas actually needed | Gas floor of 1,000,000 for trades (100,000 for approvals); costs fractions of a cent |");
L.push("| Website QA (Gina) | \"Approve PT\" stayed disabled until an unrelated sell price loaded | Approving no longer waits for a price |");
L.push("| Live site, day 2 | Activity feed failed once markets passed 10,000 blocks (RPC log-range limit) | Read history in 9,000-block windows, then only new blocks |");
L.push("");
L.push("## Team QA wallets");
L.push("");
L.push("| Address | Persona |");
L.push("|---|---|");
for (const [a, n] of Object.entries(wallets)) L.push(`| \`${a}\` | ${n} |`);
L.push("");
fs.writeFileSync(path.join(root, "docs", "QA.md"), L.join("\n"));
console.log("docs/QA.md written");
