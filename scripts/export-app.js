// Copies ABIs, live addresses and market start times into the web app.
//   npx hardhat compile && node scripts/export-app.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const ADDR = require("./lib/addresses");

const RPC = { 31611: "https://rpc.test.mezo.org", 31612: "https://rpc-http.mezo.boar.network" };
const root = path.join(__dirname, "..");
const art = (p, name) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", "contracts", p, `${name}.json`), "utf8")).abi;

async function main() {
  const out = {
    abi: {
      market: art("TenorMarket.sol", "TenorMarket"),
      router: art("TenorRouter.sol", "TenorRouter"),
      quoter: art("TenorQuoter.sol", "TenorQuoter"),
      token: art("TenorToken.sol", "TenorToken"),
    },
    chains: {},
  };

  for (const cid of Object.keys(ADDR)) {
    const f = path.join(root, "deployments", `${cid}.json`);
    if (!fs.existsSync(f)) continue;
    const dep = JSON.parse(fs.readFileSync(f, "utf8"));
    const provider = new ethers.JsonRpcProvider(RPC[cid]);
    const markets = {};
    for (const [k, m] of Object.entries(dep.markets)) {
      if (!m.pool) continue;
      // Market start = the block its contract was deployed in.
      let start = m.start;
      let startBlock = m.startBlock;
      if ((!start || !startBlock) && m.deployTx) {
        let rc = null;
        for (let i = 0; i < 5 && !rc; i++) rc = await provider.getTransactionReceipt(m.deployTx); // public RPC sometimes returns null
        if (rc) {
          startBlock = rc.blockNumber;
          start = (await provider.getBlock(rc.blockNumber)).timestamp;
        }
      }
      markets[k] = {
        market: m.market,
        pt: m.pt,
        yt: m.yt,
        pool: m.pool,
        maturity: m.maturity,
        start,
        startBlock,
        label: m.label,
        feeBps: m.feeBps,
        range: m.clPosition ? [m.clPosition.lowPt, m.clPosition.highPt] : null,
      };
    }
    out.chains[cid] = { ...ADDR[cid], router: dep.router, quoter: dep.quoter, markets };
  }

  const dest = path.join(root, "app", "src", "generated", "contracts.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${path.relative(root, dest)} (chains: ${Object.keys(out.chains).join(", ")})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
