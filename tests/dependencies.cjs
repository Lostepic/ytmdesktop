const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

(async () => {
  const { default: Conf } = await import("conf");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-upgrade-test-"));
  const store = new Conf({ cwd: directory, defaults: { integrations: {} } });
  store.set("integrations.companionServerAuthTokens", "fixture");
  store.set("appearance.zoom", 80);
  const reloaded = new Conf({ cwd: directory });
  assert.equal(reloaded.get("integrations.companionServerAuthTokens"), "fixture");
  assert.equal(reloaded.get("appearance.zoom"), 80);
  console.log("PASS: Conf settings and saved companion credentials survive reload");

  const { outputFiles } = await require("esbuild").build({
    entryPoints: [path.join(__dirname, "../src/main/integrations/companion-server/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external: ["electron", "electron-log", "conf", "fastify", "socket.io"]
  });
  const module = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, {
    module,
    exports: module.exports,
    Buffer,
    process,
    console,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    require: name => {
      if (name === "electron") return { ipcMain: { on() {}, off() {} }, safeStorage: { decryptString: bytes => bytes.toString() } };
      if (name === "electron-log") return { warn() {}, info() {}, error() {} };
      return require(name);
    }
  });
  const commands = [];
  const tokens = ["toggle-test", "volume-test", "repeat-test"];
  store.set(
    "integrations.companionServerAuthTokens",
    Buffer.from(
      JSON.stringify(
        tokens.map((token, i) => ({
          id: String(i),
          token: crypto.createHash("sha256").update(token).digest("hex")
        }))
      )
    ).toString("hex")
  );
  const companion = new module.exports.default();
  companion.provide(store, { get: () => false }, { webContents: { send: (...args) => commands.push(args) } });
  companion.createServer();
  const server = companion.fastifyServer;
  try {
    let response = await server.inject({ method: "GET", url: "/api/v1/state" });
    assert.equal(response.statusCode, 401);
    const payloads = [{ command: "playPause" }, { command: "setVolume", data: 65 }, { command: "repeatMode", data: 2 }];
    for (let i = 0; i < payloads.length; i++) {
      response = await server.inject({ method: "POST", url: "/api/v1/command", headers: { authorization: tokens[i] }, payload: payloads[i] });
      assert.equal(response.statusCode, 204, response.body);
    }
    assert.equal(commands[0][1], "playPause");
    assert.equal(commands[1][2], 65);
    assert.equal(commands[2][2], "ONE");
    response = await server.inject({
      method: "POST",
      url: "/api/v1/command",
      headers: { authorization: tokens[0] },
      payload: { command: "setVolume", data: 101 }
    });
    assert.equal(response.statusCode, 400);
    response = await server.inject({ method: "GET", url: "/api/v1/state", headers: { authorization: tokens[0] } });
    assert.equal(response.statusCode, 200);
    assert.ok(Object.hasOwn(response.json(), "player"));
    console.log("PASS: TypeBox 1/Fastify validates existing authenticated Stream Deck commands and rejects invalid input");
  } finally {
    await server.close();
  }

  class Media {
    get volume() {
      return this.value ?? 1;
    }
    set volume(value) {
      this.value = value;
    }
  }
  const context = { HTMLMediaElement: Media, window: {} };
  const enableVolumeRatio = vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/main/integrations/volume-ratio/script/enable.script.js"), "utf8"),
    context
  );
  enableVolumeRatio();
  const media = new Media();
  media.volume = 0.5;
  assert.equal(media.value, 0.125);
  assert.equal(media.volume, 0.5);
  assert.equal(Object.hasOwn(context, "get"), false);
  assert.equal(Object.hasOwn(context, "set"), false);
  console.log("PASS: volume ratio preserves its curve without leaking globals");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
