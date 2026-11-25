const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (!process.versions.electron) {
  (async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-small-display-"));
    const bundle = await require("esbuild").build({
      entryPoints: [path.join(__dirname, "../src/shared/small-display.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      write: false
    });
    const module = { exports: {} };
    require("node:vm").runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports });
    const valid = module.exports.validSmallDisplayCommand;
    assert.equal(module.exports.smallDisplayBrowseEndpoint("library"), "FEmusic_library_landing");
    assert.equal(module.exports.smallDisplayBrowseEndpoint("https://example.org/"), undefined);
    const search = module.exports.smallDisplaySearchEndpoint;
    assert.equal(search(null), undefined);
    assert.equal(search("   "), undefined);
    assert.equal(search("a".repeat(181)), undefined);
    assert.equal(search("  drum & bass  ").searchEndpoint.query, "drum & bass");
    assert.equal(search("  drum & bass  ").commandMetadata.webCommandMetadata.url, "/search?q=drum%20%26%20bass");
    for (const command of ["playPause", "next", "previous", "toggleLike", "shuffle", "mute", "unmute"]) assert.equal(valid(command, undefined, 200), true);
    for (const [command, value] of [
      ["navigate", {}],
      ["setVolume", 101],
      ["setVolume", NaN],
      ["seekTo", 201],
      ["seekTo", -1],
      ["repeatMode", 7],
      ["next", "arbitrary"]
    ])
      assert.equal(valid(command, value, 200), false);
    assert.equal(valid("seekTo", 100, 200), true);
    assert.equal(valid("seekTo", 100, 0), false);
    assert.equal(valid("setVolume", 65, 0), true);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = require("node:child_process").spawnSync(require("electron"), [__filename, directory], { env, stdio: "inherit" });
    process.exit(result.status ?? 1);
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  const { app, BrowserWindow, ipcMain, session } = require("electron");
  const directory = process.argv[2];
  app.setPath("userData", path.join(directory, "profile"));
  let presentation = { enabled: true, browsing: false, theme: 0 };
  const player = {
    title: "A very long song title that still needs room to breathe (Extended Mix)",
    artist: "Artist & guest artist",
    album: "A favourite album",
    artwork: "https://small-display.test/cover.svg",
    ready: true,
    playing: true,
    buffering: false,
    live: false,
    adPlaying: false,
    liked: false,
    repeatMode: 0,
    duration: 240,
    progress: 65,
    volume: 55,
    muted: false
  };
  const commands = [];
  const browsePages = [];
  const searches = [];
  let backRequests = 0;
  const selected = [];
  const subscriptions = [];
  let window;
  ipcMain.handle("smallDisplay:getPresentation", () => presentation);
  ipcMain.handle("smallDisplay:getState", () => player);
  ipcMain.handle("memoryStore:get", () => false);
  ipcMain.on("smallDisplay:command", (_event, ...args) => commands.push(args));
  ipcMain.on("smallDisplay:browsePage", (_event, page) => browsePages.push(page));
  ipcMain.on("smallDisplay:search", (_event, query) => searches.push(query));
  ipcMain.on("smallDisplay:back", () => backRequests++);
  ipcMain.on("smallDisplay:playQueueItem", (_event, ...args) => selected.push(args));
  ipcMain.on("smallDisplay:watchQueue", (event, open) => {
    subscriptions.push(open);
    if (open)
      event.sender.send("smallDisplay:queue", {
        hasMore: false,
        items: Array.from({ length: 30 }, (_v, index) => ({
          index,
          id: `track-${index}`,
          title: `Long track title ${index} — a radio mix`,
          artist: "Featured artist",
          artwork: player.artwork,
          duration: "4:00",
          current: index === 3
        }))
      });
  });
  ipcMain.on("smallDisplay:browse", (_event, browsing) => {
    presentation = { ...presentation, browsing };
    window.webContents.send("smallDisplay:presentation", presentation);
  });
  ipcMain.on("smallDisplay:setMode", (_event, enabled) => {
    presentation = { ...presentation, enabled };
    window.webContents.send("smallDisplay:presentation", presentation);
  });
  ipcMain.on("mainWindow:requestWindowState", () =>
    window.webContents.send("mainWindow:stateChanged", { fullscreen: false, maximized: false, minimized: false })
  );
  app.whenReady().then(async () => {
    const timeout = setTimeout(() => {
      console.error("Small display tests timed out");
      app.exit(1);
    }, 30000);
    try {
      session.defaultSession.protocol.handle(
        "https",
        () =>
          new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#cd7f78"/><stop offset="1" stop-color="#29263b"/></linearGradient></defs><rect width="480" height="480" fill="url(#g)"/><circle cx="240" cy="240" r="130" fill="#1b1a27"/><circle cx="240" cy="240" r="42" fill="#eab39b"/><circle cx="240" cy="240" r="9" fill="#222"/></svg>',
            { headers: { "content-type": "image/svg+xml" } }
          )
      );
      window = new BrowserWindow({
        width: 869,
        height: 435,
        frame: false,
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, "../.vite/renderer/windows/main/preload.cjs") }
      });
      const errors = [];
      window.webContents.on("preload-error", (_e, _f, error) => errors.push(error.message));
      await window.loadFile(path.join(__dirname, "../.vite/renderer/windows/main/index.html"));
      const evaluate = code => window.webContents.executeJavaScript(code);
      const pause = () => new Promise(r => setTimeout(r, 100));
      await pause();
      assert.deepEqual(errors, []);
      assert.equal(await evaluate("window.ytmd.smallDisplay.sandboxed && typeof window.require === 'undefined'"), true);
      assert.ok(await evaluate("!!document.querySelector('.small-player')"));
      for (const [width, height] of [
        [869, 435],
        [960, 480],
        [800, 480],
        [480, 360],
        [320, 360],
        [390, 700],
        [600, 800]
      ]) {
        window.setContentSize(width, height);
        await pause();
        const layout = await evaluate(
          `(()=>{const root=document.querySelector('.small-player'); const nodes=[...root.querySelectorAll('button,input')]; const r=root.getBoundingClientRect(); return {horizontal:root.scrollWidth<=root.clientWidth+1,vertical:root.scrollHeight<=root.clientHeight+1,touch:nodes.every(n=>{const b=n.getBoundingClientRect();return b.width>=43&&b.height>=43&&b.left>=r.left-1&&b.right<=r.right+1}),width:innerWidth,height:innerHeight};})()`
        );
        assert.ok(layout.horizontal, JSON.stringify(layout));
        assert.ok(layout.vertical, JSON.stringify(layout));
        assert.ok(layout.touch, JSON.stringify(layout));
      }
      window.setContentSize(390, 700);
      for (let i = 0; i < 10 && (await evaluate("innerWidth > 392 || innerHeight < 695")); i++) await pause();
      const portrait = await evaluate(`(() => {
        const art = document.querySelector('.artwork').getBoundingClientRect();
        const title = document.querySelector('.track-panel').getBoundingClientRect();
        return { artHeight: art.height, artBottom: art.bottom, titleTop: title.top, width: innerWidth, height: innerHeight };
      })()`);
      assert.ok(portrait.artHeight >= 140 && portrait.artBottom <= portrait.titleTop + 1, `Phone portrait stacks artwork: ${JSON.stringify(portrait)}`);
      window.setContentSize(869, 435);
      await pause();
      await evaluate("document.querySelector('[aria-label=Pause]').click()");
      await pause();
      assert.equal(commands.at(-1)[0], "playPause");
      await evaluate(
        "(()=>{const v=document.querySelector('[aria-label=Volume]');v.value='72';v.dispatchEvent(new Event('input',{bubbles:true}));v.dispatchEvent(new Event('change',{bubbles:true}));})()"
      );
      await pause();
      assert.deepEqual(commands.at(-1), ["setVolume", 72]);
      await evaluate(
        "(()=>{const v=document.querySelector('[aria-label=\"Playback position\"]');v.value='100';v.dispatchEvent(new Event('input',{bubbles:true}));v.dispatchEvent(new Event('change',{bubbles:true}));})()"
      );
      await pause();
      assert.deepEqual(commands.at(-1), ["seekTo", 100]);
      window.webContents.send("smallDisplay:state", { ...player, live: true });
      await pause();
      assert.ok(await evaluate("document.querySelector('[aria-label=\"Playback position\"]').disabled"));
      window.webContents.send("smallDisplay:state", player);
      await pause();
      await evaluate("document.querySelector('[aria-label=\"Up Next\"]').click()");
      await pause();
      assert.equal(subscriptions.at(-1), true);
      assert.equal(await evaluate("document.querySelectorAll('.track').length"), 30);
      const scrollTop = () => evaluate("document.querySelector('.queue-scroll').scrollTop");
      const initial = await scrollTop();
      assert.ok(initial > 0, "queue opens at the current track");
      await evaluate("document.querySelector('[aria-label=\"Scroll queue down\"]').click()");
      await pause();
      const paged = await scrollTop();
      assert.ok(paged > initial, "page down moves the list");
      await evaluate(`(() => {
        const row = document.querySelector('.track');
        const pointer = (type, y, buttons) => new PointerEvent(type,{bubbles:true,composed:true,pointerType:'mouse',isPrimary:true,pointerId:1,button:0,buttons,clientX:80,clientY:y});
        row.dispatchEvent(pointer('pointerdown', 200, 1));
        row.dispatchEvent(pointer('pointermove', 100, 1));
        row.dispatchEvent(pointer('pointerup', 100, 0));
        row.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
      })()`);
      await pause();
      assert.ok((await scrollTop()) > paged, "mouse drag emulates spacedesk swipe");
      assert.deepEqual(selected, [], "drag release must not start a track");
      await evaluate("document.querySelectorAll('.track')[7].click()");
      await pause();
      assert.deepEqual(selected, [[7, "track-7"]]);
      await fs.promises.writeFile(path.join(directory, "small-display-queue.png"), (await window.webContents.capturePage()).toPNG());
      console.log("Queue preview:", path.join(directory, "small-display-queue.png"));
      await evaluate("document.querySelector('[aria-label=\"Back to now playing\"]').click()");
      await pause();
      assert.equal(subscriptions.at(-1), false);
      await evaluate("document.querySelector('.browse').click()");
      await pause();
      assert.ok(await evaluate("!!document.querySelector('.browse-toolbar')"));
      await evaluate("document.querySelector('.browse-toolbar [aria-label=Library]').click()");
      await evaluate("document.querySelector('.browse-toolbar [aria-label=Pause]').click()");
      await pause();
      assert.deepEqual(browsePages, ["library"]);
      assert.equal(commands.at(-1)[0], "playPause");
      await evaluate(`(() => {
        const input = document.querySelector('[aria-label="Search music"]');
        input.focus();
        window.dispatchEvent(new Event('focus'));
        input.value = '  drum & bass  ';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return document.activeElement === input;
      })()`).then(focused => assert.equal(focused, true, "Search retains keyboard focus"));
      await evaluate("document.querySelector('form[role=search]').requestSubmit()");
      await evaluate("document.querySelector('[aria-label=\"Back in Browse\"]').click()");
      await pause();
      assert.deepEqual(searches, ["drum & bass"]);
      assert.equal(backRequests, 1);
      window.setContentSize(320, 360);
      await pause();
      const browseFit = await evaluate(`(() => {
        const bar = document.querySelector('.browse-toolbar');
        const search = document.querySelector('.search-bar').getBoundingClientRect();
        const tabs = bar.getBoundingClientRect();
        return { scroll: bar.scrollWidth, width: bar.clientWidth, viewport: innerWidth, searchHeight: search.height, tabsHeight: tabs.height, bottom: tabs.bottom, height: innerHeight };
      })()`);
      assert.ok(browseFit.scroll <= browseFit.width + 1, `Tablet toolbar should not overflow: ${JSON.stringify(browseFit)}`);
      assert.ok(Math.abs(browseFit.bottom - browseFit.height) <= 1, "Navigation is anchored to the bottom");
      assert.ok(Math.abs(browseFit.searchHeight - 56) <= 1);
      assert.ok(Math.abs(browseFit.tabsHeight - 60) <= 1);
      window.setContentSize(869, 435);
      await pause();
      await evaluate("document.querySelector('.browse-toolbar [aria-label=\"Now playing\"]').click()");
      await pause();
      assert.ok(await evaluate("!!document.querySelector('.small-player')"));
      await fs.promises.writeFile(path.join(directory, "small-display-preview.png"), (await window.webContents.capturePage()).toPNG());
      console.log("Preview:", path.join(directory, "small-display-preview.png"));
      await evaluate("document.querySelector('[aria-label=\"Return to desktop layout\"]').click()");
      await pause();
      assert.equal(await evaluate("!!document.querySelector('.small-player')"), false);
      console.log("PASS: sandboxed small display, touch layouts, Up Next, drag scrolling, intentional selections and reversible browsing");
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
}
