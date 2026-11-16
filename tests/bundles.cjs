const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const manifest = require("../package.json");
assert.equal(path.extname(manifest.main), ".cjs");
const main = fs.readFileSync(path.join(root, manifest.main), "utf8");
new vm.Script(main);
for (const name of ["main", "settings", "authorize-companion", "ytmview"]) {
  const preload = `../renderer/windows/${name}/preload.cjs`;
  assert.ok(main.includes(preload), `Missing runtime reference to ${preload}`);
  new vm.Script(fs.readFileSync(path.resolve(root, path.dirname(manifest.main), preload), "utf8"));
  if (name !== "ytmview") assert.ok(fs.existsSync(path.join(root, `.vite/renderer/windows/${name}/index.html`)));
}
console.log("PASS: Forge main entry, renderer pages and every sandbox preload are emitted as expected");
