const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const esbuild = require("esbuild");

let now = 1000;
const requests = [];
async function load(relative, fetchOverride) {
  const { outputFiles } = await esbuild.build({
    entryPoints: [path.join(__dirname, "../src/main", relative)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external: ["electron", "electron-log", "conf"]
  });
  const module = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, {
    module,
    exports: module.exports,
    console,
    Buffer,
    URLSearchParams,
    AbortController,
    AbortSignal,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    require: name => {
      if (name === "electron") return { app: { getVersion: () => "test" }, safeStorage: {} };
      if (name === "electron-log") return { warn() {}, info() {} };
      return require(name);
    },
    fetch:
      fetchOverride ??
      (async (_url, options) => {
        requests.push(Object.fromEntries(options.body));
        return { ok: true, json: async () => ({}) };
      })
  });
  return module.exports;
}

function state(progress, overrides = {}) {
  return {
    videoDetails: { id: "song", durationSeconds: 40, title: "Track", author: "Artist", isLive: false },
    videoProgress: progress,
    trackState: 1,
    adPlaying: false,
    queue: null,
    ...overrides
  };
}

(async () => {
  const { visibleWindowBounds, isCloseWindowShortcut } = await load("window-behavior.ts");
  const primary = { x: 0, y: 0, width: 1366, height: 768 };
  const left = { x: -1920, y: 0, width: 1920, height: 1080 };
  const saved = { x: -1700, y: 60, width: 1000, height: 700 };
  assert.equal(JSON.stringify(visibleWindowBounds(saved, [primary, left])), JSON.stringify(saved));
  const recovered = visibleWindowBounds(saved, [primary]);
  assert.ok(recovered.x >= 0 && recovered.y >= 0 && recovered.x + recovered.width <= primary.width);
  const oversized = visibleWindowBounds({ x: 0, y: 0, width: 4000, height: 2000 }, [primary]);
  assert.equal(oversized.width, primary.width);
  assert.equal(oversized.height, primary.height);
  assert.ok(Number.isFinite(visibleWindowBounds({ ...saved, x: NaN }, [primary]).x));
  const input = { type: "keyDown", key: "w", control: true, meta: false, alt: false, shift: false, isAutoRepeat: false };
  assert.equal(isCloseWindowShortcut(input, false), true);
  assert.equal(isCloseWindowShortcut({ ...input, control: false, meta: true }, true), true);
  for (const change of [{ type: "keyUp" }, { alt: true }, { shift: true }, { isAutoRepeat: true }, { key: "q" }]) {
    assert.equal(isCloseWindowShortcut({ ...input, ...change }, false), false);
  }
  assert.equal(isCloseWindowShortcut(input, true), false);
  console.log("PASS: monitor recovery, display bounds and platform close shortcuts");

  const { ListeningSession } = await load("integrations/listening-session.ts");
  const session = new ListeningSession();
  session.update(state(0), 1000);
  session.update(state(0), 1500); // unrelated player event between progress samples
  session.update(state(1), 2000);
  session.update(state(30), 3000); // seek forward
  assert.equal(session.listenedSeconds, 1);
  session.update(state(30, { trackState: 0 }), 4000);
  session.update(state(30, { trackState: 0 }), 104000); // paused
  assert.equal(session.listenedSeconds, 1);
  session.update(state(31, { trackState: 2 }), 105000); // buffering
  session.update(state(32, { adPlaying: true, videoDetails: { id: "advertisement" } }), 106000);
  assert.equal(session.listenedSeconds, 1);
  assert.equal(session.sequence, 1);
  session.update(state(39), 107000);
  const sequence = session.sequence;
  session.update(state(0), 108000); // repeat
  assert.equal(session.sequence, sequence + 1);
  assert.equal(session.listenedSeconds, 0);
  console.log("PASS: seeks, pauses, buffering, ads and repeat boundaries");

  const LastFM = (await load("integrations/last-fm/index.ts")).default;
  const lastfm = new LastFM();
  lastfm.isEnabled = true;
  lastfm.lastfmDetails = { sessionKey: "test", api_key: "test", secret: "test" };
  lastfm.store = { get: () => 50 };
  const Enhancements = (await load("integrations/enhancements/index.ts")).default;
  const enhancements = new Enhancements();
  enhancements.integrationSettings = { listenBrainzEnabled: true };
  const listens = [];
  enhancements.submitListen = async (_state, type) => listens.push(type);
  async function tick(progress, overrides) {
    now += 1000;
    await lastfm.updatePlayerState(state(progress, overrides));
    await enhancements.onState(state(progress, overrides));
  }
  for (let i = 0; i < 40; i++) await tick(i);
  assert.equal(requests.filter(r => r.method === "track.scrobble").length, 1);
  assert.equal(listens.filter(type => type === "single").length, 1);
  await tick(0);
  for (let i = 1; i < 20; i++) await tick(i);
  for (let i = 0; i < 100; i++) await tick(19, { trackState: 0 });
  assert.equal(requests.filter(r => r.method === "track.scrobble").length, 1);
  await tick(19);
  await tick(20);
  assert.equal(requests.filter(r => r.method === "track.scrobble").length, 2);
  assert.equal(listens.filter(type => type === "single").length, 2);
  assert.equal(listens.filter(type => type === "playing_now").length, 2);
  await tick(21);
  assert.equal(requests.filter(r => r.method === "track.scrobble").length, 2);
  await tick(0, { videoDetails: { id: "other", durationSeconds: 0 } });
  assert.equal(listens.filter(type => type === "single").length, 2);
  lastfm.playerStateFunction = () => {};
  lastfm.disable();
  assert.equal(lastfm.listeningSession.listenedSeconds, 0);
  console.log("PASS: Last.fm and ListenBrainz repeat scrobbles, paused time and missing queues");

  const pending = [];
  const SponsorEnhancements = (await load("integrations/enhancements/index.ts", () => new Promise(resolve => pending.push(resolve)))).default;
  const sponsor = new SponsorEnhancements();
  sponsor.integrationSettings = { sponsorBlockEnabled: true };
  sponsor.currentVideoId = "old";
  const oldLookup = sponsor.loadSponsorSegments("old");
  sponsor.sponsorRequest.abort();
  sponsor.currentVideoId = "new";
  const newLookup = sponsor.loadSponsorSegments("new");
  const segments = [{ UUID: "new-segment", segment: [10, 20], actionType: "skip" }];
  pending[1]({ ok: true, json: async () => segments });
  await newLookup;
  pending[0]({ ok: true, json: async () => [{ UUID: "stale-segment" }] });
  await oldLookup;
  assert.equal(sponsor.segments[0].UUID, "new-segment");
  console.log("PASS: late SponsorBlock responses cannot replace the current track's segments");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
