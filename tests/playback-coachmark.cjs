const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");

if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require("electron"), [__filename], { env, stdio: "inherit" });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow } = require("electron");
  const ts = require("typescript");
  const profile = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ytmd-coachmark-test-"));
  app.setPath("userData", profile);
  const source = fs.readFileSync(path.join(__dirname, "../src/renderer/ytmview/playback-coachmark.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    const timeout = setTimeout(() => {
      console.error("UI regression test timed out");
      app.exit(1);
    }, 20000);
    try {
      await win.loadURL("data:text/html,<html><body></body></html>");
      win.webContents.debugger.attach("1.3");
      const evaluate = async expression => {
        const result = await win.webContents.debugger.sendCommand("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
      await evaluate(`{ const exports = {}; ${compiled}; window.suppressHint = exports.suppressRestoredPlaybackCoachmark; }`);
      for (const delayed of [false, true]) {
        await evaluate(
          `document.body.innerHTML = '<ytmusic-popup-container style="display:block"><tp-yt-iron-dropdown style="display:block"></tp-yt-iron-dropdown></ytmusic-popup-container>';`
        );
        if (delayed) await evaluate("suppressHint()");
        await evaluate(
          `document.querySelector('tp-yt-iron-dropdown').innerHTML = '<yt-bubble-hint-renderer style="display: inline-block !important"><span>Start playback</span></yt-bubble-hint-renderer>'`
        );
        if (!delayed) await evaluate("suppressHint()");
        await new Promise(resolve => setTimeout(resolve, 100));
        const display = await evaluate(
          `({hint:getComputedStyle(document.querySelector('yt-bubble-hint-renderer')).display,container:getComputedStyle(document.querySelector('ytmusic-popup-container')).display,dropdown:getComputedStyle(document.querySelector('tp-yt-iron-dropdown')).display})`
        );
        assert.equal(display.hint, "none", "Restored playback hint should be hidden");
        assert.equal(display.container, "block", "Shared popup container must remain visible");
        assert.equal(display.dropdown, "block", "Shared dropdown must remain visible");
        const menu = await evaluate(`(() => {
          const button = document.createElement('button'); button.textContent='More'; document.body.append(button);
          button.onclick=()=>{const menu=document.createElement('div');menu.id='menu';menu.textContent='Like Share';document.querySelector('tp-yt-iron-dropdown').append(menu)};
          button.click();
          const menu=document.querySelector('#menu'); const animation=menu.animate([{opacity:0},{opacity:1}],{duration:500});
          animation.pause(); animation.currentTime=250;
          return {height:menu.getBoundingClientRect().height,opacity:Number(getComputedStyle(menu).opacity)};
        })()`);
        assert.ok(menu.height > 0, "Menu opened by a click must have a visible box");
        assert.ok(menu.opacity > 0 && menu.opacity < 1, "Popup animation must be able to render intermediate frames");
        await evaluate("document.querySelector('yt-bubble-hint-renderer span').textContent='Another hint'");
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.deepEqual(
          await evaluate(
            `({display:document.querySelector('yt-bubble-hint-renderer').style.display,priority:document.querySelector('yt-bubble-hint-renderer').style.getPropertyPriority('display')})`
          ),
          { display: "inline-block", priority: "important" },
          "Reused hints must recover their original style"
        );
        console.log(`PASS: ${delayed ? "delayed" : "existing"} hint preserves menus, animation and renderer reuse`);
      }
      await evaluate("document.body.innerHTML='<ytmusic-popup-container style=\"display:block\">Start playback</ytmusic-popup-container>'; suppressHint()");
      assert.equal(
        await evaluate("document.querySelector('ytmusic-popup-container').style.display"),
        "block",
        "Matching text alone must never hide an unknown/shared element"
      );
      console.log("PASS: unknown markup is left visible");
      clearTimeout(timeout);
      win.destroy();
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
