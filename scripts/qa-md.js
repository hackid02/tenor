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
L.push("| Final website check (Hana) | On a market where PT trades above 1 MUSD, Buy YT showed a cost of 0 and a negative break-even, and the router would revert | Buy YT is blocked with a plain explanation when PT is at or above 1 MUSD |");
L.push("| Final website check (Hana) | Dust amounts (0.0000001 MUSD) could be submitted, and leading zeros stayed in the field | Minimum trade 0.01; leading zeros removed |");
L.push("| Outside testers on MetaMask mobile | After a reload, the wallet looked connected but refused the first transaction: \"The requested method and/or account has not been authorized\" (EIP-1193 4100). Reconnecting fixed it | Before sending, the app checks the wallet still lists the account; on 4100 it asks the wallet to authorize again and retries, from the same click. Tested with a wallet that reproduces the 4100 state |");
L.push("| First outside tester | Approved MUSD, then stopped: the Approve step read like the trade itself, so no trade was sent until we explained | Under the button: \"Step 1 of 2: approve MUSD once. Then confirm the trade.\", then \"Step 2 of 2: confirm the trade.\" |");
L.push("| Approve-hint check (Ivo) | With a tiny amount (0.05 MUSD) the chart's three end values all read 0.05 | End values use enough decimals to differ |");
L.push("| Rate history on the demo market | A PT price above 1 MUSD drew a fixed APY of -13.44% | Shown as \"none\", matching the headline |");
L.push("");
L.push("## Final website check (Nov 11)");
L.push("");
L.push("A fresh Team QA wallet (Hana) ran every flow through the real UI on localhost against Mezo Testnet: connect, approve MUSD, Fix my yield (3 MUSD), Sell future yield (2 MUSD), Buy YT and Sell YT (2 YT), approve PT and Sell PT early. **All passed**; 10 MUSD in, 9.9986 MUSD out after the round trip. Amount field edge cases (empty, 0, letters, negative, too large for the pool, over balance) and the demo market were also checked; the bugs found are in the table above. The full test suite passed (29 of 29, fork tests on a copy of Mezo Testnet), the production build runs with its security headers without console errors, and every link in the docs and app resolves.");
L.push("");
L.push("## Team QA wallets");
L.push("");
L.push("| Address | Persona |");
L.push("|---|---|");
for (const [a, n] of Object.entries(wallets)) L.push(`| \`${a}\` | ${n} |`);
L.push("");
fs.writeFileSync(path.join(root, "docs", "QA.md"), L.join("\n"));
console.log("docs/QA.md written");
