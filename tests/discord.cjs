const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const path = require("node:path");
const vm = require("node:vm");

async function load(file, mocks = {}, globals = {}) {
  const { outputFiles } = await require("esbuild").build({
    entryPoints: [path.join(__dirname, "../src/main", file)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external: ["electron", "electron-log", ...Object.keys(mocks)]
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
    require: name => mocks[name] ?? (name === "electron-log" ? { info() {}, warn() {}, debug() {}, error() {} } : require(name)),
    ...globals
  });
  return module.exports;
}

(async () => {
  const sockets = [];
  class Socket extends EventEmitter {
    writable = true;
    destroyed = false;
    writes = [];
    constructor() {
      super();
      sockets.push(this);
    }
    write(buffer) {
      this.writes.push(buffer);
    }
    destroy() {
      this.destroyed = true;
      this.emit("close");
    }
    end() {
      this.destroy();
    }
  }
  const { default: IPC, OPCode } = await load("integrations/discord-presence/minimal-discord-client/ipc.ts", { net: { Socket } });
  const ipc = new IPC();
  const received = [];
  ipc.on("data", (op, json) => received.push([op, json]));
  ipc.on("error", () => {});
  function frame(op, json) {
    const bytes = Buffer.from(JSON.stringify(json));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(op, 0);
    header.writeUInt32LE(bytes.length, 4);
    return Buffer.concat([header, bytes]);
  }
  const ping = frame(OPCode.PING, { nonce: "fragmented" });
  sockets[0].emit("data", ping.subarray(0, 3));
  sockets[0].emit("data", ping.subarray(3, 10));
  assert.equal(received.length, 0);
  sockets[0].emit("data", ping.subarray(10));
  assert.equal(received[0][0], OPCode.PING);
  assert.equal(received[0][1].nonce, "fragmented");
  sockets[0].emit("data", Buffer.concat([frame(OPCode.FRAME, { n: 1 }), frame(OPCode.FRAME, { n: 2 })]));
  assert.equal(received.length, 3);
  const invalid = Buffer.alloc(8);
  invalid.writeUInt32LE(2 * 1024 * 1024, 4);
  sockets[0].emit("data", invalid);
  assert.equal(sockets[0].destroyed, true);
  ipc.send({ ignored: true });
  assert.equal(sockets.length, 1);
  ipc.destroy();
  sockets[0].emit("error", new Error("late socket error"));
  sockets[0].emit("data", invalid);
  console.log("PASS: fragmented/coalesced Discord frames, size limits and disconnected writes");

  const transports = [];
  let hang = false;
  class Transport extends EventEmitter {
    sent = [];
    constructor() {
      super();
      transports.push(this);
    }
    connect() {
      if (!hang) queueMicrotask(() => this.emit("connect"));
    }
    send(json, op) {
      this.sent.push({ json, op });
    }
    close() {
      this.emit("close");
    }
    destroy() {
      this.removeAllListeners();
    }
  }
  const { default: Client } = await load("integrations/discord-presence/minimal-discord-client/index.ts", {
    "./ipc": { __esModule: true, default: Transport, OPCode }
  });
  const client = new Client("test");
  await client.connect();
  transports[0].emit("data", OPCode.PING, { nonce: "heartbeat" });
  assert.equal(transports[0].sent.at(-1).op, OPCode.PONG);
  assert.equal(transports[0].sent.at(-1).json.nonce, "heartbeat");
  client.destroy();
  await assert.rejects(client.connect());
  hang = true;
  const cancelled = new Client("cancel");
  const connecting = cancelled.connect();
  cancelled.destroy();
  await connecting.then(
    () => assert.fail("cancelled connect resolved"),
    () => {}
  );
  console.log("PASS: Discord heartbeat replies and cancellation during connection");

  let clock = 0;
  const timers = new Set();
  const timer = (fn, delay) => {
    const t = { fn, at: clock + delay, unref() {} };
    timers.add(t);
    return t;
  };
  async function advance(ms) {
    const end = clock + ms;
    for (;;) {
      const next = [...timers].filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      clock = next.at;
      timers.delete(next);
      next.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    clock = end;
    await Promise.resolve();
    await Promise.resolve();
  }
  let available = false;
  const clients = [];
  class PresenceClient extends EventEmitter {
    attempts = 0;
    activities = [];
    clears = 0;
    constructor() {
      super();
      clients.push(this);
    }
    connect() {
      this.attempts++;
      if (!available) return Promise.reject(new Error("offline"));
      this.emit("connect");
      return Promise.resolve();
    }
    setActivity(activity) {
      this.activities.push(activity);
    }
    clearActivity() {
      this.clears++;
    }
    destroy() {
      this.removeAllListeners();
    }
  }
  const state = {
    videoDetails: { id: "song", title: "Track", author: "Artist", durationSeconds: 200, thumbnails: [] },
    videoProgress: 5,
    trackState: 1,
    hasFullMetadata: true
  };
  const player = { getState: () => state, addEventListener() {}, removeEventListener() {} };
  const { default: Presence } = await load(
    "integrations/discord-presence/index.ts",
    {
      "./minimal-discord-client": { __esModule: true, default: PresenceClient },
      "../../player-state-store": { __esModule: true, default: player, VideoState: { Playing: 1, Paused: 0 } }
    },
    {
      setTimeout: timer,
      clearTimeout: t => timers.delete(t),
      Date: class extends Date {
        static now() {
          return clock;
        }
      }
    }
  );
  const memory = { set() {} };
  const presence = new Presence();
  presence.provide(memory);
  presence.enable();
  await Promise.resolve();
  for (let i = 0; i < 40; i++) await advance(60000);
  assert.ok(clients[0].attempts > 30, "reconnect must continue beyond the old limit");
  assert.equal(timers.size, 1, "only one retry may be pending");
  available = true;
  await advance(61000);
  assert.equal(clients[0].activities.at(-1).details, "Track");
  presence.provide(memory, false);
  await advance(1000);
  assert.equal(clients[0].activities.at(-1).buttons.length, 0);
  const paused = { ...state, trackState: 0 };
  presence.playerStateChanged(paused);
  for (let i = 0; i < 40; i++) {
    await advance(1000);
    presence.playerStateChanged(paused);
  }
  assert.equal(clients[0].clears, 1, "repeated paused samples must not postpone clearing presence");
  presence.disable();
  const attempts = clients[0].attempts;
  await advance(300000);
  assert.equal(clients[0].attempts, attempts);
  assert.equal(timers.size, 0);
  console.log("PASS: indefinite bounded Discord retries, current-track restore, button option and pause cleanup");

  const { showAuxiliaryWindow } = await load("window-behavior.ts");
  const actions = [];
  showAuxiliaryWindow({
    isDestroyed: () => false,
    isMinimized: () => true,
    isVisible: () => false,
    restore: () => actions.push("restore"),
    show: () => actions.push("show"),
    focus: () => actions.push("focus")
  });
  assert.deepEqual(actions, ["restore", "show", "focus"]);
  showAuxiliaryWindow({ isDestroyed: () => true });
  console.log("PASS: hidden/minimized Settings windows can be restored and focused");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
