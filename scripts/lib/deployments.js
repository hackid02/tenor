const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "..", "deployments");

function file(chainId) {
  return path.join(dir, `${chainId}.json`);
}

function load(chainId) {
  const f = file(chainId);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { markets: {} };
}

function save(chainId, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(chainId), JSON.stringify(data, null, 2) + "\n");
}

module.exports = { load, save };
