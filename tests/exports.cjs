const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ytmd-export-test-"));
  let writes = 0;
  let mkdirs = 0;
  let failText = false;
  const monitoredFs = {
    ...fs,
    mkdir: async (...args) => {
      mkdirs++;
      return fs.mkdir(...args);
    },
    writeFile: async (...args) => {
      writes++;
      if (failText && args[0].endsWith("now-playing.txt.tmp")) throw new Error("fixture write failure");
      return fs.writeFile(...args);
    }
  };
  const { outputFiles } = await require("esbuild").build({
    entryPoints: [path.join(__dirname, "../src/main/integrations/enhancements/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external: ["electron", "electron-log", "conf", "fs/promises", "../../player-state-store"]
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
    require: name => {
      if (name === "electron") return { app: { getPath: () => directory, getVersion: () => "test" }, safeStorage: {} };
      if (name === "electron-log") return { warn() {} };
      if (name === "fs/promises") return monitoredFs;
      if (name === "../../player-state-store") return { VideoState: { Playing: 1 } };
      return require(name);
    }
  });
  try {
    const enhancements = new module.exports.default();
    const state = { videoDetails: { title: "Track", author: "Artist", id: "track", durationSeconds: 200 }, videoProgress: 5, trackState: 1 };
    const jsonPath = path.join(directory, "YTM Desktop/now-playing.json");
    const textPath = path.join(directory, "YTM Desktop/now-playing.txt");
    await enhancements.exportNowPlaying(state);
    const initial = await fs.readFile(jsonPath, "utf8");
    assert.equal(writes, 2);
    await enhancements.exportNowPlaying(state);
    assert.equal(writes, 2, "unchanged samples must not rewrite either file");
    assert.equal(await fs.readFile(jsonPath, "utf8"), initial);
    const newer = { ...state, videoProgress: 6 };
    await Promise.all([enhancements.exportNowPlaying(newer), enhancements.exportNowPlaying(newer)]);
    assert.equal(writes, 3, "only one JSON write may run; unchanged text must not be rewritten");
    assert.equal(mkdirs, 1);
    assert.equal(JSON.parse(await fs.readFile(jsonPath, "utf8")).progress, 6);
    failText = true;
    const changed = { ...newer, videoDetails: { ...state.videoDetails, title: "Next" } };
    await enhancements.exportNowPlaying(changed);
    assert.equal(await fs.readFile(textPath, "utf8"), "Artist — Track");
    failText = false;
    await enhancements.exportNowPlaying(changed);
    assert.equal(await fs.readFile(textPath, "utf8"), "Artist — Next", "failed writes must be retried");
    assert.deepEqual((await fs.readdir(path.dirname(jsonPath))).sort(), ["now-playing.json", "now-playing.txt"]);
    console.log("PASS: atomic now-playing exports, unchanged-write suppression, bounded concurrency and failed-write retry");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
