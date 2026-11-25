// IMPORTANT NOTES ABOUT THIS FILE
//
// This file contains all logic related to interacting with YTM itself and works under the assumption of a trusted environment and data.
// Anything passed to this file does not necessarily need to be or will be validated.
//
// If adding new things to this file ensure best security practices are followed.
// - executeJavaScript is used to enter the main world when you need to interact with YTM APIs or anything from YTM that would otherwise need the prototypes or events from YTM.
//   - Always wrap your executeJavaScript code in an IIFE calling it from outside executeJavaScript when it returns
// - Add functions to exposeInMainWorld when you need to call back to the main program. By nature you should not trust data coming from this.

import { contextBridge, ipcRenderer, webFrame } from "electron";
import Store from "../store-ipc/store";
import { StoreSchema } from "~shared/store/schema";

import playerBarControlsScript from "./scripts/playerbarcontrols.script?raw";
import hookPlayerApiEventsScript from "./scripts/hookplayerapievents.script?raw";
import getPlaylistsScript from "./scripts/getplaylists.script?raw";
import toggleLikeScript from "./scripts/togglelike.script?raw";
import toggleDislikeScript from "./scripts/toggledislike.script?raw";
import playerCompatibilityScript from "./scripts/playercompatibility.script?raw";
import { suppressRestoredPlaybackCoachmark } from "./playback-coachmark";
import { EqualizerController } from "./equalizer";
import { installDragScroll } from "../drag-scroll";

const store = new Store<StoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  sendVideoProgress: (volume: number) => ipcRenderer.send("ytmView:videoProgressChanged", volume),
  sendVideoState: (state: number) => ipcRenderer.send("ytmView:videoStateChanged", state),
  sendVideoData: (videoDetails: unknown, playlistId: string, album: { id: string; text: string }, likeStatus: unknown, hasFullMetadata: boolean) =>
    ipcRenderer.send("ytmView:videoDataChanged", videoDetails, playlistId, album, likeStatus, hasFullMetadata),
  sendStoreUpdate: (queueState: unknown, likeStatus: string, volume: number, muted: boolean, adPlaying: boolean) =>
    ipcRenderer.send("ytmView:storeStateChanged", queueState, likeStatus, volume, muted, adPlaying),
  sendCreatePlaylistObservation: (playlist: unknown) => ipcRenderer.send("ytmView:createPlaylistObserved", playlist),
  sendDeletePlaylistObservation: (playlistId: string) => ipcRenderer.send("ytmView:deletePlaylistObserved", playlistId)
});

function createStyleSheet() {
  const css = document.createElement("style");
  css.appendChild(
    document.createTextNode(`
      :root {
        --ytmd-surface: #111117;
        --ytmd-surface-raised: #1a1820;
        --ytmd-border: rgba(255, 255, 255, 0.08);
        --ytmd-accent: #ff4f61;
      }

      body.ytmd-theme-1 { --ytmd-surface: #050505; --ytmd-surface-raised: #101010; --ytmd-accent: #ff174d; }
      body.ytmd-theme-1, body.ytmd-theme-1 ytmusic-app { background: #000 !important; }
      body.ytmd-theme-2 { --ytmd-surface: #071923; --ytmd-surface-raised: #0c2633; --ytmd-accent: #22c7e8; }
      body.ytmd-theme-3 { --ytmd-surface: #171025; --ytmd-surface-raised: #26183c; --ytmd-accent: #a879ff; }

      body.ytmd-compact ytmusic-nav-bar,
      body.ytmd-compact ytmusic-guide-renderer,
      body.ytmd-compact ytmusic-app-layout > #content,
      body.ytmd-compact ytmusic-player-page { display: none !important; }
      body.ytmd-compact ytmusic-player-bar {
        position: fixed !important;
        inset: 0 !important;
        height: 100% !important;
        padding: 0 12px !important;
      }

      html, body, ytmusic-app {
        background: #0b0b10 !important;
      }

      * { scrollbar-width: thin; scrollbar-color: #4a4651 transparent; }
      *::-webkit-scrollbar { width: 10px; height: 10px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background: #403c47; border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
      *::-webkit-scrollbar-thumb:hover { background-color: #595461; }

      html.ytmd-small-browse {
        --ytmusic-guide-width: 0px !important;
        --ytmusic-mini-guide-width: 0px !important;
        --ytmusic-player-bar-height: 0px !important;
        --ytmusic-nav-bar-height: 0px !important;
      }
      html.ytmd-small-browse ytmusic-app-layout {
        --ytmusic-guide-width: 0px !important;
        --ytmusic-mini-guide-width: 0px !important;
        --ytmusic-player-bar-height: 0px !important;
        --ytmusic-nav-bar-height: 0px !important;
      }
      html.ytmd-small-browse ytmusic-guide-renderer,
      html.ytmd-small-browse ytmusic-mini-guide-renderer,
      html.ytmd-small-browse ytmusic-nav-bar,
      html.ytmd-small-browse ytmusic-player-bar { display: none !important; }
      html.ytmd-small-browse ytmusic-app-layout > #content {
        margin-inline-start: 0 !important;
        width: 100% !important;
      }
      html.ytmd-small-browse,
      html.ytmd-small-browse body,
      html.ytmd-small-browse ytmusic-app-layout > #content { overflow-x: clip !important; }
      html.ytmd-small-browse ytmusic-browse-response,
      html.ytmd-small-browse ytmusic-search-page {
        --ytmusic-content-width: min(100vw - 24px, 1040px) !important;
      }
      html.ytmd-small-browse ytmusic-responsive-list-item-renderer,
      html.ytmd-small-browse ytmusic-player-queue-item { min-height: 52px; }
      html.ytmd-small-browse ytmusic-shelf-renderer,
      html.ytmd-small-browse ytmusic-carousel-shelf-renderer { scroll-margin-top: 10px; }
      html.ytmd-small-browse * { scrollbar-width: auto; scrollbar-color: #6a6177 transparent; }
      html.ytmd-small-browse ytmusic-responsive-list-item-renderer,
      html.ytmd-small-browse ytmusic-two-row-item-renderer { user-select: none; }
      @media (max-width: 600px) {
        html.ytmd-small-browse ytmusic-responsive-list-item-renderer { min-height: 60px; }
        html.ytmd-small-browse ytmusic-responsive-list-item-renderer #menu,
        html.ytmd-small-browse ytmusic-two-row-item-renderer #menu { min-width: 44px; min-height: 44px; }
      }

      ytmusic-nav-bar {
        background: #0d0d13 !important;
        border-bottom: 1px solid var(--ytmd-border) !important;
      }

      ytmusic-guide-renderer {
        background: var(--ytmd-surface) !important;
        border-right: 1px solid var(--ytmd-border);
      }

      ytmusic-guide-entry-renderer,
      ytmusic-guide-collapsible-entry-renderer,
      ytmusic-guide-section-renderer #items > * {
        border-radius: 10px !important;
      }

      ytmusic-guide-entry-renderer[active] {
        background: linear-gradient(90deg, rgba(255, 79, 97, 0.18), rgba(255, 79, 97, 0.04)) !important;
      }

      ytmusic-player-bar {
        background: #111117 !important;
        border-top: 1px solid var(--ytmd-border) !important;
        box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.22);
      }

      ytmusic-player-bar.ytmd-centered-player-controls {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        column-gap: 16px;
        align-items: center;
      }
      ytmusic-player-bar.ytmd-centered-player-controls .middle-controls { grid-column: 1; grid-row: 1; justify-self: start; width: 100%; max-width: 420px; min-width: 0; }
      ytmusic-player-bar.ytmd-centered-player-controls .left-controls { grid-column: 2; grid-row: 1; justify-self: center; position: static !important; transform: none !important; width: auto; min-width: max-content; }
      ytmusic-player-bar.ytmd-centered-player-controls .right-controls { grid-column: 3; grid-row: 1; justify-self: end; min-width: 0; }

      @media (max-width: 1000px) {
        ytmusic-player-bar.ytmd-centered-player-controls {
          display: flex !important;
        }

        ytmusic-player-bar.ytmd-centered-player-controls .middle-controls,
        ytmusic-player-bar.ytmd-centered-player-controls .left-controls,
        ytmusic-player-bar.ytmd-centered-player-controls .right-controls {
          position: relative !important;
          inset: auto !important;
          transform: none !important;
        }

        ytmusic-player-bar.ytmd-centered-player-controls .middle-controls {
          flex: 1 1 auto;
          width: auto;
        }

        ytmusic-player-bar.ytmd-centered-player-controls .left-controls,
        ytmusic-player-bar.ytmd-centered-player-controls .right-controls {
          flex: 0 0 auto;
        }
      }

      ytmusic-responsive-list-item-renderer,
      ytmusic-two-row-item-renderer,
      ytmusic-player-queue-item {
        border-radius: 10px;
        transition: background-color 140ms ease, transform 140ms ease;
      }

      ytmusic-two-row-item-renderer img,
      ytmusic-responsive-list-item-renderer img,
      ytmusic-playlist-shelf-renderer img {
        border-radius: 8px !important;
      }

      ytmusic-chip-cloud-chip-renderer {
        border-radius: 999px !important;
        /* The host and inner button are measured independently by YouTube.
           Clipping here trims text at compact window widths. */
        overflow: visible !important;
        flex-shrink: 0 !important;
      }

      tp-yt-paper-toast {
        box-sizing: border-box !important;
        min-width: max-content !important;
        max-width: min(360px, calc(100vw - 32px)) !important;
        white-space: nowrap !important;
      }

      ytmusic-search-box input {
        letter-spacing: -0.01em;
      }

      ytmusic-player-bar tp-yt-paper-icon-button,
      ytmusic-player-bar .yt-icon-button {
        border-radius: 999px;
        transition: background-color 120ms ease, color 120ms ease;
      }

      ytmusic-player-bar tp-yt-paper-icon-button:hover,
      ytmusic-player-bar .yt-icon-button:hover {
        background: rgba(255, 255, 255, 0.08) !important;
      }

      ytmusic-player-queue #contents {
        padding: 8px !important;
      }

      ytmusic-player-queue-item[selected] {
        background: rgba(255, 79, 97, 0.11) !important;
      }

      ytmusic-responsive-list-item-renderer:hover,
      ytmusic-player-queue-item:hover {
        background: rgba(255, 255, 255, 0.055) !important;
      }

      tp-yt-paper-dialog,
      ytmusic-menu-popup-renderer,
      ytmusic-player-queue {
        background: var(--ytmd-surface-raised) !important;
        border: 1px solid var(--ytmd-border);
        border-radius: 14px !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42) !important;
      }

      #progress-bar.ytmusic-player-bar,
      #primaryProgress.tp-yt-paper-progress {
        --paper-progress-active-color: var(--ytmd-accent) !important;
      }

      *:focus-visible {
        outline: 2px solid var(--ytmd-accent) !important;
        outline-offset: 2px;
      }

      .ytmd-history-back, .ytmd-history-forward {
        cursor: pointer;
        margin: 0 18px 0 2px;
        font-size: 24px;
        color: rgba(255, 255, 255, 0.5);
      }

      .ytmd-history-back.pivotbar, .ytmd-history-forward.pivotbar {
        padding-top: 12px;
      }

      .ytmd-history-back.disabled, .ytmd-history-forward.disabled {
        cursor: not-allowed;
      }

      .ytmd-history-back:hover:not(.disabled), .ytmd-history-forward:hover:not(.disabled) {
        color: #FFFFFF;
      }

      .ytmd-hidden {
        display: none;
      }

      .ytmd-persist-volume-slider {
        opacity: 1 !important;
        pointer-events: initial !important;
      }
      
      .ytmd-player-bar-control.library-button {
        margin-left: 8px;
      }

      .ytmd-player-bar-control.library-button.hidden {
        display: none;
      }

      .ytmd-player-bar-control.playlist-button {
        margin-left: 8px;
      }

      .ytmd-player-bar-control.playlist-button.hidden {
        display: none;
      }

      .ytmd-player-bar-control.sleep-timer-button.active {
        color: #FFFFFF;
      }
    `)
  );
  document.head.appendChild(css);
}

function createMaterialSymbolsLink() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100,0,0";
  return link;
}

async function waitForCondition(condition: () => Promise<boolean>, timeoutMs = 30_000): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await condition()) return true;
    } catch {
      // YouTube Music can replace its app shell while starting. Retry until the timeout.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return false;
}

function createNavigationMenuArrows() {
  // Go back in history
  const historyBackElement = document.createElement("span");
  historyBackElement.classList.add("material-symbols-outlined", "ytmd-history-back", "disabled");
  historyBackElement.innerText = "west";

  historyBackElement.addEventListener("click", function () {
    if (!historyBackElement.classList.contains("disabled")) {
      history.back();
    }
  });

  // Go forward in history
  const historyForwardElement = document.createElement("span");
  historyForwardElement.classList.add("material-symbols-outlined", "ytmd-history-forward", "disabled");
  historyForwardElement.innerText = "east";

  historyForwardElement.addEventListener("click", function () {
    if (!historyForwardElement.classList.contains("disabled")) {
      history.forward();
    }
  });

  ipcRenderer.on("ytmView:navigationStateChanged", (event, state) => {
    if (state.canGoBack) {
      historyBackElement.classList.remove("disabled");
    } else {
      historyBackElement.classList.add("disabled");
    }

    if (state.canGoForward) {
      historyForwardElement.classList.remove("disabled");
    } else {
      historyForwardElement.classList.add("disabled");
    }
  });

  const pivotBar = document.querySelector("ytmusic-pivot-bar-renderer");
  if (!pivotBar) {
    // New YTM UI
    const searchBar = document.querySelector("ytmusic-search-box");
    const navBar = searchBar?.parentNode;
    if (!searchBar || !navBar) return;
    navBar.insertBefore(historyForwardElement, searchBar);
    navBar.insertBefore(historyBackElement, historyForwardElement);
  } else {
    historyForwardElement.classList.add("pivotbar");
    historyBackElement.classList.add("pivotbar");
    pivotBar.prepend(historyForwardElement);
    pivotBar.prepend(historyBackElement);
  }
}

function createKeyboardNavigation() {
  const keyboardNavigation = document.createElement("div");
  keyboardNavigation.tabIndex = 32767;
  keyboardNavigation.onfocus = () => {
    keyboardNavigation.blur();
    ipcRenderer.send("ytmView:switchFocus", "main");
  };
  document.body.appendChild(keyboardNavigation);
}

async function createAdditionalPlayerBarControls() {
  (await webFrame.executeJavaScript(playerBarControlsScript))();
}

async function hideChromecastButton() {
  (
    await webFrame.executeJavaScript(`
      (function() {
        window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_CAST_AVAILABLE', payload: false });
      })
    `)
  )();
}

async function hookPlayerApiEvents() {
  (await webFrame.executeJavaScript(hookPlayerApiEventsScript))();
}

function overrideHistoryButtonDisplay() {
  document.querySelector<HTMLElement>("#history-link .history-button")?.style.setProperty("display", "inline-block", "important");
}

function setCenteredPlayerControls(enabled: boolean) {
  document.querySelector("ytmusic-app-layout>ytmusic-player-bar")?.classList.toggle("ytmd-centered-player-controls", enabled);
}

function applyAppearance(themePreset: number, compactMode: boolean) {
  document.body.classList.remove("ytmd-theme-0", "ytmd-theme-1", "ytmd-theme-2", "ytmd-theme-3");
  document.body.classList.add(`ytmd-theme-${themePreset ?? 0}`);
  document.body.classList.toggle("ytmd-compact", compactMode);
}

function getYTMTextRun(runs: { text: string }[]) {
  let final = "";
  for (const run of runs) {
    final += run.text;
  }
  return final;
}

// This function helps hook YTM
(async function () {
  (await webFrame.executeJavaScript(playerCompatibilityScript))();
  (
    await webFrame.executeJavaScript(`
    (function() {
      let fakeBaseClass = function() {
        try {
          if (!window.__YTMD_HOOK__) {
            if (this.store && !!this.store.getState && !!this.store.dispatch && !!this.store.subscribe) {
              let ytmdHook = {
                ytmStore: this.store
              };
              Object.freeze(ytmdHook);
              window.__YTMD_HOOK__ = ytmdHook;
            }
          }
        } catch {}
      }
      Object.defineProperty(window, "PolymerFakeBaseClassWithoutHtml", {
        set: (value) => {},
        get: () => {
          return fakeBaseClass
        }
      })
    })
  `)
  )();
})();

window.addEventListener("DOMContentLoaded", async () => {
  if (window.location.hostname !== "music.youtube.com") {
    if (window.location.hostname === "consent.youtube.com" || window.location.hostname === "accounts.google.com") {
      ipcRenderer.send("ytmView:loaded");
    }
    return;
  }

  let playerControlsReady = false;
  // Optional audio processing cannot block player hooks or remote commands.
  void (async () => {
    const equalizer = new EqualizerController(document, status => ipcRenderer.send("ytmView:equalizerStatus", status));
    equalizer.update((await store.get("playback"))?.equalizer);
    store.onDidAnyChange(state => equalizer.update(state.playback?.equalizer));
  })().catch(error => console.warn("Equalizer setup failed", error));
  let volumeDelta = 10;
  const pendingRemoteCommands: Array<{ command: string; value: unknown }> = [];
  ipcRenderer.on("remoteControl:execute", (_event, command: string, value: unknown) => {
    if (!playerControlsReady) {
      // Stream Deck can reconnect before YouTube's player API is ready. Keep a
      // small ordered queue instead of silently dropping those button presses.
      if (pendingRemoteCommands.length >= 32) pendingRemoteCommands.shift();
      pendingRemoteCommands.push({ command, value });
      return;
    }
    void executeRemoteCommand(command, value).catch(() => {
      console.warn(`[YTM Desktop] Player command failed: ${command}`);
    });
  });

  // Apply the lightweight visual shell immediately. Player and integration
  // hooks can finish in the background without exposing an unstyled page.
  if (location.origin === "https://music.youtube.com") {
    createStyleSheet();
    let removeDrag: (() => void) | undefined;
    const applyTouchBrowse = (enabled: boolean) => {
      document.documentElement.classList.toggle("ytmd-small-browse", enabled);
      if (!enabled) {
        removeDrag?.();
        removeDrag = undefined;
        return;
      }
      removeDrag ??= installDragScroll(document, (event, axis) => {
        const nodes = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
        if (nodes.some(node => node.matches("ytmusic-player-bar, ytmusic-nav-bar, ytmusic-guide-renderer, ytmusic-popup-container"))) return null;
        return (
          nodes.find(node => {
            const style = getComputedStyle(node);
            return axis === "x"
              ? node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(style.overflowX)
              : node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(style.overflowY);
          }) ?? (axis === "y" ? (document.scrollingElement as HTMLElement | null) : null)
        );
      });
    };
    let settingsReceived = false;
    store.onDidAnyChange((state, previous) => {
      if (state.appearance?.smallDisplayMode === previous.appearance?.smallDisplayMode) return;
      settingsReceived = true;
      applyTouchBrowse(state.appearance?.smallDisplayMode === true);
    });
    void store
      .get("appearance")
      .then(appearance => {
        if (!settingsReceived) applyTouchBrowse(appearance?.smallDisplayMode === true);
      })
      .catch(() => {});
  }

  const hooked = await waitForCondition(async () => {
    return (
      await webFrame.executeJavaScript(`
        (function() {
          return Boolean(window.__YTMD_HOOK__);
        })
      `)
    )();
  });

  if (!hooked) {
    ipcRenderer.send("ytmView:loaded");
    return;
  }

  const materialSymbols = createMaterialSymbolsLink();
  document.head.appendChild(materialSymbols);

  const playerApiReady = await waitForCondition(async () => {
    return (
      await webFrame.executeJavaScript(`
          (function() {
            return Boolean(window.__YTMD_PLAYER__.getPlayerApi()?.isReady?.());
          })
        `)
    )();
  });

  if (!playerApiReady) {
    ipcRenderer.send("ytmView:loaded");
    return;
  }

  playerControlsReady = true;
  for (const pendingCommand of pendingRemoteCommands.splice(0)) {
    try {
      await executeRemoteCommand(pendingCommand.command, pendingCommand.value);
    } catch {
      // A stale command must not prevent the remaining integrations from loading.
    }
  }

  createNavigationMenuArrows();
  createKeyboardNavigation();
  await Promise.allSettled([createAdditionalPlayerBarControls(), hideChromecastButton(), hookPlayerApiEvents()]);
  overrideHistoryButtonDisplay();

  const [integrationScripts, state, playback, shortcuts, appearance] = await Promise.all([
    ipcRenderer.invoke("ytmView:getIntegrationScripts") as Promise<{ [integrationName: string]: { [scriptName: string]: string } }>,
    store.get("state"),
    store.get("playback"),
    store.get("shortcuts"),
    store.get("appearance")
  ]);
  const continueWhereYouLeftOff = playback.continueWhereYouLeftOff;
  volumeDelta = Number(shortcuts.volumeDelta ?? 10);
  store.onDidAnyChange(newState => {
    volumeDelta = Number(newState.shortcuts.volumeDelta ?? 10);
  });

  if (continueWhereYouLeftOff) {
    // Directly restored watch URLs can show the same hint as navigation below.
    suppressRestoredPlaybackCoachmark();
    // The last page the user was on is already a page where it will be playing a song from (no point telling YTM to play it again)
    if (!state.lastUrl.startsWith("https://music.youtube.com/watch")) {
      if (state.lastVideoId) {
        document.dispatchEvent(
          new CustomEvent("yt-navigate", {
            detail: {
              endpoint: {
                watchEndpoint: {
                  videoId: state.lastVideoId,
                  playlistId: state.lastPlaylistId
                }
              }
            }
          })
        );
      }
    } else {
      (
        await webFrame.executeJavaScript(`
          (function() {
            window.ytmd.sendVideoData(window.__YTMD_PLAYER__.getPlayerApi().getPlayerResponse().videoDetails, window.__YTMD_PLAYER__.getPlayerApi().getPlaylistId());
          })
        `)
      )();
    }

    if (state.lastVideoProgress > 0) {
      const savedProgress = state.lastVideoProgress;
      (
        await webFrame.executeJavaScript(`
          (function(savedProgress) {
            const playerApi = window.__YTMD_PLAYER__.getPlayerApi();
            if (!playerApi) return;
            const restore = () => {
              playerApi.seekTo(savedProgress);
              playerApi.removeEventListener("onStateChange", onStateChange);
            };
            const onStateChange = state => {
              if ([1, 2, 3, 5].includes(state)) restore();
            };
            playerApi.addEventListener("onStateChange", onStateChange);
            try { restore(); } catch {}
          })
        `)
      )(savedProgress);
    }
  }

  const alwaysShowVolumeSlider = appearance.alwaysShowVolumeSlider;
  if (alwaysShowVolumeSlider) {
    document.querySelector("ytmusic-app-layout>ytmusic-player-bar #volume-slider")?.classList.add("ytmd-persist-volume-slider");
  }
  setCenteredPlayerControls(appearance.centeredPlayerControls ?? false);
  applyAppearance(appearance.themePreset ?? 0, appearance.compactMode ?? false);

  async function executeRemoteCommand(command: string, value: unknown): Promise<void> {
    switch (command) {
      case "playPause":
      case "play": {
        // Play is an explicit transport request. Keep the page's autoplay
        // policy intact and apply activation to the call in this view, not
        // to a function returned after the script's activation has expired.
        await webFrame.executeJavaScript(
          `void (() => {
            const player = window.__YTMD_PLAYER__;
            const api = player.getPlayerApi();
            if (${command === "playPause"} && player.getPlayerBar().playing) api.pauseVideo();
            else api.playVideo();
          })()`,
          true
        );
        break;
      }

      case "pause": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              window.__YTMD_PLAYER__.getPlayerApi().pauseVideo();
            })
          `)
        )();
        break;
      }

      case "next": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              window.__YTMD_PLAYER__.getPlayerApi().nextVideo();
            })
          `)
        )();
        break;
      }

      case "previous": {
        (
          await webFrame.executeJavaScript(`
            (function() {
              window.__YTMD_PLAYER__.getPlayerApi().previousVideo();
            })
          `)
        )();
        break;
      }

      case "toggleLike": {
        (await webFrame.executeJavaScript(toggleLikeScript))();
        break;
      }

      case "toggleDislike": {
        (await webFrame.executeJavaScript(toggleDislikeScript))();
        break;
      }

      case "volumeUp": {
        const currentVolumeUp: number = (
          await webFrame.executeJavaScript(`
            (function() {
              return window.__YTMD_PLAYER__.getPlayerApi().getVolume();
            })
          `)
        )();

        const newVolumeUp = Math.min(100, currentVolumeUp + volumeDelta);
        (
          await webFrame.executeJavaScript(`
            (function(newVolumeUp) {
              window.__YTMD_PLAYER__.getPlayerApi().setVolume(newVolumeUp);
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeUp });
            })
          `)
        )(newVolumeUp);
        break;
      }

      case "volumeDown": {
        const currentVolumeDown: number = (
          await webFrame.executeJavaScript(`
            (function() {
              return window.__YTMD_PLAYER__.getPlayerApi().getVolume();
            })
          `)
        )();

        const newVolumeDown = Math.max(0, currentVolumeDown - volumeDelta);
        (
          await webFrame.executeJavaScript(`
            (function(newVolumeDown) {
              window.__YTMD_PLAYER__.getPlayerApi().setVolume(newVolumeDown);
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeDown });
            })
          `)
        )(newVolumeDown);
        break;
      }

      case "setVolume": {
        const valueInt = Number(value);
        // Check if Volume is a number and between 0 and 100
        if (isNaN(valueInt) || valueInt < 0 || valueInt > 100) {
          return;
        }

        (
          await webFrame.executeJavaScript(`
            (function(valueInt) {
              window.__YTMD_PLAYER__.getPlayerApi().setVolume(valueInt);
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: valueInt });
            })
          `)
        )(valueInt);
        break;
      }

      case "mute":
        (
          await webFrame.executeJavaScript(`
            (function() {
              window.__YTMD_PLAYER__.getPlayerApi().mute();
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: true });
            })
          `)
        )();
        break;

      case "unmute":
        (
          await webFrame.executeJavaScript(`
            (function() {
              window.__YTMD_PLAYER__.getPlayerApi().unMute();
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: false });
            })
          `)
        )();
        break;

      case "repeatMode":
        (
          await webFrame.executeJavaScript(`
            (function(value) {
              window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_REPEAT', payload: value });
            })
          `)
        )(value);
        break;

      case "seekTo":
        (
          await webFrame.executeJavaScript(`
            (function(value) {
              window.__YTMD_PLAYER__.getPlayerApi().seekTo(value);
            })
          `)
        )(value);
        break;

      case "shuffle":
        (
          await webFrame.executeJavaScript(`
            (function() {
              window.__YTMD_PLAYER__.getPlayerBar().queue.shuffle();
            })
          `)
        )();
        break;

      case "playQueueIndex": {
        const selection = typeof value === "object" && value !== null ? (value as { index?: unknown; id?: unknown }) : { index: value };
        const index = selection.index;
        if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) break;
        const expectedId = typeof selection.id === "string" ? selection.id : null;

        await webFrame.executeJavaScript(
          `void (function(index, expectedId) {
              const queue = window.__YTMD_HOOK__?.ytmStore?.getState()?.queue;
              const length = queue?.items?.length ?? 0;
              const song = index < length ? queue.items[index] : queue?.automixItems?.[index - length];
              const renderer = song?.playlistPanelVideoRenderer ?? song?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
              const endpoint = renderer?.navigationEndpoint?.watchEndpoint;
              if (!endpoint || (expectedId !== null && (renderer.videoId ?? endpoint.videoId) !== expectedId)) return;

              document.dispatchEvent(
                new CustomEvent("yt-navigate", {
                  detail: {
                    endpoint: {
                      watchEndpoint: endpoint
                    }
                  }
                })
              );
            })(${index}, ${JSON.stringify(expectedId)})`,
          true
        );

        break;
      }

      case "navigate": {
        const endpoint = value;
        document.dispatchEvent(
          new CustomEvent("yt-navigate", {
            detail: {
              endpoint
            }
          })
        );
        break;
      }
    }
  }

  ipcRenderer.on("ytmView:getPlaylists", async (_event, requestId) => {
    const rawPlaylists = await (await webFrame.executeJavaScript(getPlaylistsScript))();

    const playlists = [];
    for (const rawPlaylist of rawPlaylists) {
      const playlist = rawPlaylist.playlistAddToOptionRenderer;
      const images = playlist.thumbnail?.thumbnails ?? playlist.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails ?? [];
      const thumbnails = (Array.isArray(images) ? images : [])
        .filter((image: { url?: unknown }) => typeof image?.url === "string" && /^https?:\/\//.test(image.url))
        .map((image: { url: string; width?: number; height?: number }) => ({ url: image.url, width: image.width ?? 0, height: image.height ?? 0 }));
      playlists.push({
        id: playlist.playlistId,
        title: getYTMTextRun(playlist.title.runs),
        thumbnailUrl: thumbnails.at(-1)?.url ?? "",
        thumbnails
      });
    }
    ipcRenderer.send(`ytmView:getPlaylists:response:${requestId}`, playlists);
  });

  store.onDidAnyChange(newState => {
    if (newState.appearance.alwaysShowVolumeSlider) {
      const volumeSlider = document.querySelector("#volume-slider");
      if (volumeSlider && !volumeSlider.classList.contains("ytmd-persist-volume-slider")) {
        volumeSlider.classList.add("ytmd-persist-volume-slider");
      }
    } else {
      const volumeSlider = document.querySelector("#volume-slider");
      if (volumeSlider?.classList.contains("ytmd-persist-volume-slider")) {
        volumeSlider.classList.remove("ytmd-persist-volume-slider");
      }
    }
    setCenteredPlayerControls(newState.appearance.centeredPlayerControls ?? false);
    applyAppearance(newState.appearance.themePreset ?? 0, newState.appearance.compactMode ?? false);
  });

  ipcRenderer.on("ytmView:refitPopups", async () => {
    // Update 4/14/2024: Broken until a hook is provided for this
    /*
    (
      await webFrame.executeJavaScript(`
        (function() {
          document.querySelector("ytmusic-popup-container").refitPopups_();
        })
      `)
    )();
    */
  });

  ipcRenderer.on("ytmView:executeScript", async (_event, integrationName, scriptName) => {
    const scripts = integrationScripts[integrationName];
    if (scripts) {
      const script = scripts[scriptName];
      if (script) {
        (await webFrame.executeJavaScript(script))();
      }
    }
  });

  ipcRenderer.send("ytmView:loaded");
});
