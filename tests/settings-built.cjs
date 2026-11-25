const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-settings-test-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require("node:child_process").spawnSync(require("electron"), [__filename, profile], { env, stdio: "inherit" });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow, ipcMain } = require("electron");
  app.setPath("userData", process.argv[2]);
  const values = { general: {}, appearance: { zoom: 80 }, playback: {}, integrations: {}, shortcuts: {}, lastfm: {} };
  const saved = [];
  ipcMain.on("settings:set", (_event, key, value) => {
    saved.push([key, value]);
  });
  ipcMain.handle("settings:get", (_event, key) => values[key] ?? {});
  ipcMain.handle("memoryStore:get", () => false);
  const preloadSource = fs.readFileSync(path.join(__dirname, "../src/renderer/windows/settings/preload.ts"), "utf8");
  for (const [, channel] of preloadSource.matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)) {
    ipcMain.handle(channel, () => (channel === "app:getVersion" ? require("../package.json").version : channel.includes("list") ? [] : false));
  }
  app
    .whenReady()
    .then(async () => {
      const timeout = setTimeout(() => {
        console.error("Built Settings timed out");
        app.exit(1);
      }, 20000);
      try {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            preload: path.join(__dirname, "../.vite/renderer/windows/settings/preload.cjs")
          }
        });
        let preloadError = null;
        window.webContents.on("preload-error", (_event, _file, error) => {
          preloadError = error;
        });
        window.webContents.setZoomFactor(0.8);
        await window.loadFile(path.join(__dirname, "../.vite/renderer/windows/settings/index.html"));
        const text = () => window.webContents.executeJavaScript("document.body.innerText");
        for (let i = 0; i < 100 && (await text()).includes("Loading settings"); i++) await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(preloadError, null);
        assert.ok(!(await text()).includes("Settings could not be loaded"));
        assert.ok((await text()).includes("Startup, notifications, and desktop behaviour."));
        await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Appearance')).click()");
        assert.ok((await text()).includes("Interface scale"));
        await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Playback')).click()");
        assert.ok((await text()).includes("10-band equalizer"));
        assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('.eq-band input[type=range]').length"), 10);
        await window.webContents.executeJavaScript(
          "(() => { const select = document.querySelector('.eq-toolbar select'); select.value = 'Bass boost'; select.dispatchEvent(new Event('change', {bubbles:true})); })()"
        );
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(
          saved.some(([key, value]) => key === "playback.equalizer" && value.gains[0] === 4),
          "preset must persist through the built preload"
        );
        await window.webContents.executeJavaScript(
          "(() => { const slider = [...document.querySelectorAll('.equalizer .ytmd-setting')].find(b => b.textContent.includes('Preamp (dB)')).querySelector('input[type=range]'); slider.value = '-3.5'; slider.dispatchEvent(new Event('input', {bubbles:true})); slider.dispatchEvent(new Event('change', {bubbles:true})); })()"
        );
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(
          saved.some(([key, value]) => key === "playback.equalizer" && value.preampDb === -3.5),
          "range values must persist as numbers"
        );
        const layout = await window.webContents.executeJavaScript(
          "[...document.querySelectorAll('.eq-band')].every(b => b.getBoundingClientRect().width > 100 && b.scrollWidth <= b.clientWidth + 1)"
        );
        assert.ok(layout, "EQ labels and sliders must fit at 80% interface scale");
        await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('About')).click()");
        assert.ok((await text()).includes(require("../package.json").version));
        window.webContents.setZoomFactor(1);
        for (const [width, height] of [[800, 436], [520, 320]]) {
          window.setContentSize(width, height);
          await new Promise(resolve => setTimeout(resolve, 120));
          const result = await window.webContents.executeJavaScript(`(() => {
            const title = document.querySelector('.titlebar').getBoundingClientRect();
            const search = document.querySelector('[aria-label="Search settings"]').getBoundingClientRect();
            const content = document.querySelector('.content');
            const viewport = content.getBoundingClientRect();
            return {title: title.top, below: search.top >= title.bottom, inside:search.bottom <= viewport.bottom && viewport.bottom <= innerHeight + 1};
          })()`);
          assert.ok(result.title >= 0 && result.below && result.inside, `Settings fit at ${width} × ${height}: ${JSON.stringify(result)}`);
        }
        console.log("PASS: Vite-built Settings navigation, ten EQ bands, preset persistence and layout at 80% scale with the sandbox preload");
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) {
        console.error(error);
        clearTimeout(timeout);
        app.exit(1);
      }
    })
    .catch(error => {
      console.error(error);
      app.exit(1);
    });
}
