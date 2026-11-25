const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Validate the actual Forge binary (including its fuses), not the development
// Electron executable. Never allow this probe to use the installed profile.
const executable = path.resolve(process.argv[2] ?? "out/YTM Desktop-win32-x64/youtube-music-desktop-app.exe");
assert.equal(process.platform, "win32", "This probe is for Windows packages");
assert.ok(fs.statSync(executable).isFile(), "Build the packaged Windows app first");
assert.ok(fs.existsSync(path.join(path.dirname(executable), "resources", "app.asar")), "Point the probe at a packaged app");
assert.ok(!fs.existsSync(path.resolve(path.dirname(executable), "../Update.exe")), "Use a portable build so the probe cannot trigger the installed updater");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-packaged-startup-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_ENV;
const child = spawn(executable, [`--user-data-dir=${profile}`, "--enable-logging=stderr"], { cwd: path.dirname(executable), env, windowsHide: true });
let desktopReady = false;
let musicReady = false;
let settleTimer;
let finished = false;
const diagnostic = [];
const deadline = setTimeout(() => finish(false, "Timed out waiting for both renderers to load"), 25_000);

function finish(ok, message) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  clearTimeout(settleTimer);
  if (child.exitCode === null) child.kill();
  if (ok) console.log(`PASS: ${message}`);
  else {
    console.error(`FAIL: ${message}`);
    if (diagnostic.length) console.error(diagnostic.join("\n"));
    console.error(`Diagnostic profile: ${profile}`);
    process.exitCode = 1;
  }
}

function observe(stream) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", chunk => {
    const lines = (pending + chunk).split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        if (diagnostic.length === 30) diagnostic.shift();
        diagnostic.push(line);
      }
      if (/Desktop interface failed|Music renderer stopped|Render frame was disposed/.test(line)) {
        finish(false, "The packaged app lost a renderer before startup completed");
      }
      if (line.includes("Desktop interface ready")) desktopReady = true;
      if (line.includes("Music renderer loaded")) musicReady = true;
    }
    if (!finished && desktopReady && musicReady && !settleTimer) {
      settleTimer = setTimeout(() => finish(true, "Packaged desktop interface and music renderer started with a clean test profile"), 2000);
    }
  });
}
observe(child.stdout);
observe(child.stderr);
child.once("error", error => finish(false, error.message));
child.once("exit", code => finish(false, `App exited before startup was verified (${code})`));
