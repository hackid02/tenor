// Full dress rehearsal on a local copy of Mezo testnet. Spends nothing.
//   npm run rehearse
process.env.TENOR_NO_AUTORUN = "1";
const deploy = require("./deploy");
const seed = require("./seed-pool");

(async () => {
  process.env.KEY = "main";
  await deploy();
  await seed();
  process.env.KEY = "demo";
  process.env.LABEL = "DEMO";
  process.env.MATURITY = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  process.env.SEED = "20";
  await deploy();
  await seed();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
