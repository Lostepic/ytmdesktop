const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (!process.versions.electron) {
  (async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-eq-test-"));
    await require("esbuild").build({
      stdin: {
        contents: `
        import { ipcRenderer } from 'electron';
        import { EqualizerController } from './src/renderer/ytmview/equalizer';
        let contexts = 0, sources = 0;
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
          constructor(options) { super(options); contexts++; }
          createMediaElementSource(media) { sources++; return super.createMediaElementSource(media); }
        };
        document.addEventListener('DOMContentLoaded', () => {
          const controller = new EqualizerController(document, status => ipcRenderer.send('eq:status', status));
          ipcRenderer.on('eq:update', (_event, settings) => controller.update(settings));
          ipcRenderer.on('eq:inspect', () => {
            const frequencies = Float32Array.from({ length: 4096 }, (_, i) => 20 * (20000 / 20) ** (i / 4095));
            const magnitude = new Float32Array(4096), phase = new Float32Array(4096);
            const response = new Float64Array(4096).fill(1);
            controller.probes.forEach(filter => { filter.getFrequencyResponse(frequencies, magnitude, phase); response.forEach((_, i) => response[i] *= magnitude[i]); });
            ipcRenderer.send('eq:snapshot', { contexts, sources, state: controller.context?.state,
              gains: controller.settings.gains, preamp: controller.effectivePreamp,
              peakDb: controller.effectivePreamp + 20 * Math.log10(Math.max(...response)) });
          });
          controller.update(null);
        });`,
        resolveDir: path.join(__dirname, ".."),
        loader: "js"
      },
      outfile: path.join(directory, "preload.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"]
    });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const requireGesture of [false, true]) {
      env.YTM_EQ_REQUIRE_GESTURE = requireGesture ? "1" : "";
      const result = require("node:child_process").spawnSync(require("electron"), [__filename, directory], { env, stdio: "inherit" });
      if (result.error) console.error(result.error);
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
    process.exit(0);
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  const { app, BrowserWindow, ipcMain } = require("electron");
  const directory = process.argv[2];
  app.setPath("userData", path.join(directory, "profile"));
  let status = null;
  ipcMain.on("eq:status", (_event, value) => {
    status = value;
  });
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async state => {
    for (let i = 0; i < 400 && status?.state !== state; i++) await pause(10);
    assert.equal(status?.state, state, JSON.stringify(status));
  };
  app
    .whenReady()
    .then(async () => {
      const timeout = setTimeout(() => {
        console.error("Equalizer regression timed out");
        app.exit(1);
      }, 20000);
      try {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            autoplayPolicy: process.env.YTM_EQ_REQUIRE_GESTURE ? "document-user-activation-required" : "no-user-gesture-required",
            preload: path.join(directory, "preload.cjs")
          }
        });
        await window.loadURL("data:text/html,<html><body><ytmusic-player></ytmusic-player></body></html>");
        const snapshot = () =>
          new Promise(resolve => {
            ipcMain.once("eq:snapshot", (_event, value) => resolve(value));
            window.webContents.send("eq:inspect");
          });
        const configure = value => window.webContents.send("eq:update", value);
        await waitFor("off");
        assert.equal((await snapshot()).contexts, 0);
        configure({ enabled: true, gains: Array(10).fill(0) });
        await waitFor("flat");
        assert.equal((await snapshot()).contexts, 0);

        const newVideo = async () =>
          window.webContents.executeJavaScript(`(async () => {
        document.querySelector('video')?.remove();
        const bytes = new Uint8Array(44 + 800 * 2), data = new DataView(bytes.buffer);
        const text = (at, value) => [...value].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
        text(0, 'RIFF'); data.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
        data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
        data.setUint32(24, 8000, true); data.setUint32(28, 16000, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
        text(36, 'data'); data.setUint32(40, bytes.length - 44, true);
        const video = document.createElement('video'); video.className = 'html5-main-video';
        const loaded = new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('WAV fixture failed')); });
        video.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        document.querySelector('ytmusic-player').append(video); await loaded;
      })()`);
        await newVideo();
        const boost = { enabled: true, gains: [0, 0, 0, 0, 0, 12, 0, 0, 0, 0], automaticHeadroom: true, preampDb: 0 };
        configure(boost);
        if (process.env.YTM_EQ_REQUIRE_GESTURE) {
          await waitFor("suspended");
          assert.equal((await snapshot()).sources, 0, "blocked audio must not capture the media element");
          window.webContents.debugger.attach("1.3");
          await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", x: 10, y: 10, button: "left", clickCount: 1 });
          await window.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", x: 10, y: 10, button: "left", clickCount: 1 });
          window.webContents.debugger.detach();
        }
        await waitFor("active");
        let result = await snapshot();
        assert.equal(result.contexts, 1);
        assert.equal(result.sources, 1);
        assert.ok(result.preamp < -12.5);
        assert.ok(result.peakDb < -0.7, `Headroom peak ${result.peakDb}`);
        configure({ enabled: false });
        await waitFor("bypassed");
        assert.equal((await snapshot()).state, "running", "bypass must not suspend captured media");
        configure(boost);
        await waitFor("active");
        assert.equal((await snapshot()).sources, 1);
        await newVideo();
        await pause(50);
        await waitFor("active");
        assert.equal((await snapshot()).sources, 2);
        configure({ enabled: false });
        await waitFor("bypassed");
        await window.webContents.executeJavaScript("window.savedVideo = document.querySelector('video'); savedVideo.remove()");
        await waitFor("off");
        await window.webContents.executeJavaScript("document.querySelector('ytmusic-player').append(savedVideo)");
        await waitFor("bypassed");
        result = await snapshot();
        assert.equal(result.sources, 2, "reinserted media must reuse its source even while bypassed");
        await window.webContents.executeJavaScript(
          `document.querySelector('video').remove(); const unsafe = document.createElement('video'); unsafe.preload='none'; unsafe.className='html5-main-video'; unsafe.src='https://invalid.example/audio'; document.querySelector('ytmusic-player').append(unsafe)`
        );
        configure(boost);
        await waitFor("unavailable");
        assert.equal((await snapshot()).sources, 2);
        configure({ enabled: false, gains: [Infinity, 99, -99], preampDb: NaN });
        await waitFor("off");
        result = await snapshot();
        assert.deepEqual(result.gains.slice(0, 3), [0, 12, -12]);
        console.log(
          `PASS: isolated Web Audio EQ (${process.env.YTM_EQ_REQUIRE_GESTURE ? "gesture-required activation" : "autoplay allowed"}), zero-allocation flat/off mode, measured headroom, bypass, media replacement/reuse and unsafe-source rejection`
        );
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
