const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (!process.versions.electron) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytmd-player-test-"));
    const built = process.argv.includes("--built");
    const preload = built ? path.join(__dirname, "../.vite/renderer/windows/ytmview/preload.cjs") : path.join(dir, "preload.cjs");
    // Bundle the production preload, including its real IPC command handler.
    if (!built)
      await require("esbuild").build({
        entryPoints: [path.join(__dirname, "../src/renderer/ytmview/preload.ts")],
        outfile: preload,
        bundle: true,
        platform: "node",
        external: ["electron"],
        plugins: [
          {
            name: "raw-scripts",
            setup(build) {
              build.onResolve({ filter: /\?raw$/ }, args => ({
                path: require.resolve(path.resolve(args.resolveDir, args.path.slice(0, -4))),
                namespace: "raw"
              }));
              build.onLoad({ filter: /.*/, namespace: "raw" }, args => ({ contents: fs.readFileSync(args.path, "utf8"), loader: "text" }));
            }
          }
        ]
      });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = require("node:child_process").spawnSync(require("electron"), [__filename, preload, dir], { env, stdio: "inherit" });
    if (result.error) console.error(result.error);
    process.exit(result.status ?? 1);
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  const { app, BrowserWindow, ipcMain, session } = require("electron");
  app.on("window-all-closed", () => {});
  app.setPath("userData", path.join(process.argv[3], "profile"));
  const settings = {
    state: { lastUrl: "https://music.youtube.com/watch?v=fixture" },
    playback: { continueWhereYouLeftOff: true },
    shortcuts: { volumeDelta: 10 },
    appearance: { smallDisplayMode: true }
  };
  ipcMain.handle("settings:get", (_event, key) => settings[key]);
  ipcMain.handle("ytmView:getIntegrationScripts", () => ({}));
  let latestStoreState;
  ipcMain.on("ytmView:storeStateChanged", (_event, ...args) => {
    latestStoreState = args;
  });

  function fixture(mode) {
    return `<!doctype html><html><body>
      <ytmusic-app-layout>
        <ytmusic-guide-renderer>Desktop guide</ytmusic-guide-renderer>
        <div id="content">
          <div id="fixture-rail" style="width:180px;overflow-x:auto">
            <button id="fixture-card" style="width:720px">Swipe this rail</button>
          </div>
        </div>
        <ytmusic-player-bar><ytmusic-like-button-renderer></ytmusic-like-button-renderer></ytmusic-player-bar>
      </ytmusic-app-layout>
      <ytmusic-popup-container style="display:block"><yt-bubble-hint-renderer>Start playback</yt-bubble-hint-renderer></ytmusic-popup-container>
      <script>
        window.calls = []; window.events = {};
        window.state = {player:{volume:50,muted:false,adPlaying:false},likeStatus:{videos:{}},queue:{items:[],automixItems:[]}};
        document.addEventListener('yt-navigate', e => calls.push(['navigate', e.detail.endpoint?.watchEndpoint?.videoId]));
        const api = {
          isReady:()=>true, getPlayerResponse:()=>({videoDetails:{videoId:'fixture'}}), getPlaylistId:()=>'',
          addEventListener:(name,fn)=>{(events[name] ||= []).push(fn)}, removeEventListener:()=>{},
          getVolume:()=>state.player.volume,
          setVolume:v=>{state.player.volume=v; calls.push(['volume',v])},
          playVideo:()=>{
            if (!navigator.userActivation.isActive) { calls.push(['play blocked']); return; }
            bar.playing=true; calls.push(['play']);
          }, pauseVideo:()=>{bar.playing=false; calls.push(['pause'])},
          nextVideo:()=>calls.push(['next']), previousVideo:()=>calls.push(['previous']),
          mute:()=>calls.push(['mute']), unMute:()=>calls.push(['unmute']), seekTo:v=>calls.push(['seek',v])
        };
        const element = document.querySelector('ytmusic-player-bar');
        element.addEventListener('yt-action', e => {
          if (e.detail.actionName !== 'yt-service-request') return;
          e.detail.returnValue.push({ajaxPromise:Promise.resolve({data:{contents:[{addToPlaylistRenderer:{playlists:[
            {playlistAddToOptionRenderer:{playlistId:'art',title:{runs:[{text:'Artwork'}]},thumbnail:{thumbnails:[{url:'https://example.com/cover.jpg',width:240,height:240}]}}},
            {playlistAddToOptionRenderer:{playlistId:'none',title:{runs:[{text:'No artwork'}]}}}
          ]}}]}})});
        });
        window.bar = ${mode === "direct" ? "element" : `(element.${mode} = {})`};
        Object.assign(bar,{playerApi:api,playing:false,queue:{shuffle:()=>calls.push(['shuffle'])}});
        const likeElement=document.querySelector('ytmusic-like-button-renderer');
        const like=${mode === "direct" ? "likeElement" : `(likeElement.${mode} = {})`};
        like.data={likeStatus:'INDIFFERENT',serviceEndpoints:['LIKE','DISLIKE','INDIFFERENT'].map(status=>({likeEndpoint:{status}}))};
        likeElement.addEventListener('yt-action',e=>calls.push(['like',e.detail.args[1].likeEndpoint.status]));
        window.subscribers=[];
        const store={getState:()=>state, subscribe:fn=>subscribers.push(fn), dispatch:action=>{
          if(action.type==='SET_VOLUME') state.player.volume=action.payload;
          if(action.type==='SET_MUTED') state.player.muted=action.payload;
          if(action.type==='SET_REPEAT') calls.push(['repeat',action.payload]);
          subscribers.forEach(fn=>fn());
        }};
        setTimeout(()=>window.PolymerFakeBaseClassWithoutHtml.call({store}),50);
      </script></body></html>`;
  }

  app.whenReady().then(async () => {
    let mode = "direct";
    session.defaultSession.protocol.handle("https", () => new Response(fixture(mode), { headers: { "content-type": "text/html" } }));
    const timeout = setTimeout(() => {
      console.error("Player regression test timed out");
      app.exit(1);
    }, 30000);
    try {
      for (mode of ["direct", "inst", "polymerController"]) {
        const win = new BrowserWindow({
          show: false,
          webPreferences: { preload: process.argv[2], sandbox: true, contextIsolation: true, backgroundThrottling: false }
        });
        win.webContents.debugger.attach("1.3");
        const evaluate = async expression => {
          const result = await win.webContents.debugger.sendCommand("Runtime.evaluate", { expression, returnByValue: true });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return result.result.value;
        };
        const loaded = new Promise(resolve => ipcMain.once("ytmView:loaded", resolve));
        await win.loadURL("https://music.youtube.com/");
        // Verify a command received before the store/player startup completes.
        win.webContents.send("remoteControl:execute", "setVolume", 42);
        await loaded;
        assert.equal(await evaluate("getComputedStyle(document.querySelector('ytmusic-guide-renderer')).display"), "none");
        if (mode === "direct") {
          const swipe = await evaluate(`(() => {
            const rail = document.querySelector('#fixture-rail');
            const card = document.querySelector('#fixture-card');
            let clicked = false;
            card.addEventListener('click', () => clicked = true);
            for (const [type, x, buttons] of [['pointerdown',150,1],['pointermove',50,1],['pointerup',50,0]]) {
              card.dispatchEvent(new PointerEvent(type, {
                bubbles:true, composed:true, button:0, buttons, isPrimary:true, pointerId:1, pointerType:'mouse', clientX:x, clientY:35
              }));
            }
            card.dispatchEvent(new MouseEvent('click', { bubbles:true, detail:1 }));
            return {left:rail.scrollLeft, width:rail.clientWidth, scrollWidth:rail.scrollWidth, clicked, overflow:getComputedStyle(rail).overflowX};
          })()`);
          assert.ok(Math.abs(swipe.left - 100) <= 1 && !swipe.clicked, `Horizontal swipe must not open a card: ${JSON.stringify(swipe)}`);
        }
        assert.equal(
          await evaluate("getComputedStyle(document.querySelector('yt-bubble-hint-renderer')).display"),
          "none",
          "Direct watch restoration must suppress the playback hint"
        );
        assert.equal(
          await evaluate("getComputedStyle(document.querySelector('ytmusic-popup-container')).display"),
          "block",
          "Shared menus must remain visible"
        );
        const send = async (command, value) => {
          win.webContents.send("remoteControl:execute", command, value);
          await new Promise(resolve => setTimeout(resolve, 30));
        };
        assert.equal(await evaluate("navigator.userActivation.isActive"), false, "Restored page must not begin activated");
        for (const [command, value] of [
          ["playPause"],
          ["playPause"],
          ["play"],
          ["pause"],
          ["next"],
          ["previous"],
          ["volumeUp"],
          ["volumeDown"],
          ["mute"],
          ["unmute"],
          ["seekTo", 25],
          ["shuffle"],
          ["repeatMode", "ALL"],
          ["toggleLike"],
          ["toggleDislike"]
        ])
          await send(command, value);
        assert.deepEqual(
          await evaluate("calls"),
          [
            ["volume", 42],
            ["play"],
            ["pause"],
            ["play"],
            ["pause"],
            ["next"],
            ["previous"],
            ["volume", 52],
            ["volume", 42],
            ["mute"],
            ["unmute"],
            ["seek", 25],
            ["shuffle"],
            ["repeat", "ALL"],
            ["like", "LIKE"],
            ["like", "DISLIKE"]
          ],
          `${mode}: all remote commands must reach the player`
        );
        assert.equal(latestStoreState[2], 42, `${mode}: volume state reaches companion integrations`);
        assert.equal(latestStoreState[3], false, `${mode}: mute state reaches companion integrations`);
        const playlistReply = new Promise(resolve => ipcMain.once(`ytmView:getPlaylists:response:${mode}`, (_event, value) => resolve(value)));
        win.webContents.send("ytmView:getPlaylists", mode);
        const playlists = await playlistReply;
        assert.equal(playlists[0].thumbnailUrl, "https://example.com/cover.jpg");
        assert.equal(playlists[0].thumbnails[0].width, 240);
        assert.equal(playlists[1].thumbnailUrl, "");
        assert.deepEqual(playlists[1].thumbnails, []);
        await evaluate(`state.queue.items = [{playlistPanelVideoRenderer:{videoId:'queued-song',navigationEndpoint:{watchEndpoint:{videoId:'queued-song'}}}}]`);
        await send("playQueueIndex", { index: 0, id: "stale-song" });
        assert.notEqual((await evaluate("calls.at(-1)"))[0], "navigate", "A stale queue row must not play the wrong track");
        await send("playQueueIndex", { index: 0, id: "queued-song" });
        assert.deepEqual(await evaluate("calls.at(-1)"), ["navigate", "queued-song"]);
        await send("playQueueIndex", 0);
        assert.deepEqual(
          await evaluate("calls.slice(-2)"),
          [
            ["navigate", "queued-song"],
            ["navigate", "queued-song"]
          ],
          "Numeric companion commands still work"
        );
        await evaluate("bar.playerApi = {...bar.playerApi, pauseVideo:()=>calls.push(['replacement'])}");
        await send("pause");
        assert.deepEqual(await evaluate("calls.at(-1)"), ["replacement"], "Commands must resolve the current player API, not cache it");
        await send("setVolume", 101);
        await send("setVolume", "invalid");
        assert.deepEqual(await evaluate("calls.at(-1)"), ["replacement"], "Invalid volume commands must be ignored");
        console.log(`PASS: ${mode} player commands, early queue, state reporting and API replacement`);
        win.destroy();
      }
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
