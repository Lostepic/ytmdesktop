<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import KeybindInput from "../../components/KeybindInput.vue";
import YTMDSetting from "../../components/YTMDSetting.vue";
import { StoreSchema, ThemePreset, TrayIconStyle } from "~shared/store/schema";
import { AuthToken } from "~shared/integrations/companion-server/types";
import logo from "~assets/icons/ytmd.png";

declare const YTMD_GIT_COMMIT_HASH: string;
declare const YTMD_GIT_BRANCH: string;

const ytmdVersion = await window.ytmd.getAppVersion();
const ytmdCommitHash = YTMD_GIT_COMMIT_HASH.substring(0, 7);
const ytmdBranch = YTMD_GIT_BRANCH;

const isDarwin = window.ytmd.isDarwin;
const isLinux = window.ytmd.isLinux;

const currentTab = ref(1);
const settingsSearch = ref("");
const tabMeta: Record<number, { title: string; description: string }> = {
  1: { title: "General", description: "Startup, notifications, and desktop behaviour." },
  2: { title: "Appearance", description: "Make the player feel at home on your desktop." },
  3: { title: "Playback", description: "Control how music resumes, sounds, and appears." },
  4: { title: "Plugins & devices", description: "Connect Stream Deck, companion apps, and music services." },
  5: { title: "Keyboard shortcuts", description: "Keep the music moving from anywhere." },
  99: { title: "About", description: "Version details and application updates." }
};
const requiresRestart = ref(false);
const checkingForUpdate = ref(false);
const updateAvailable = ref(await window.ytmd.isAppUpdateAvailable());
const updateNotAvailable = ref(false);
const updateDownloaded = ref(await window.ytmd.isAppUpdateDownloaded());

const store = window.ytmd.store;
const memoryStore = window.ytmd.memoryStore;
const safeStorage = window.ytmd.safeStorage;

const safeStorageAvailable = ref<boolean>(await memoryStore.get("safeStorageAvailable"));

function parseAuthTokens(value: string | null): AuthToken[] {
  if (!value) return [];
  try {
    const tokens: unknown = JSON.parse(value);
    return Array.isArray(tokens) ? (tokens as AuthToken[]) : [];
  } catch {
    return [];
  }
}

const general: StoreSchema["general"] = await store.get("general");
const appearance: StoreSchema["appearance"] = await store.get("appearance");
const playback: StoreSchema["playback"] = await store.get("playback");
const integrations: StoreSchema["integrations"] = await store.get("integrations");
const shortcuts: StoreSchema["shortcuts"] = await store.get("shortcuts");
const lastFM: StoreSchema["lastfm"] = await store.get("lastfm");
let persistedAppearance = appearance;
let persistedIntegrations = integrations;
let persistedLastFM = lastFM;

const disableHardwareAcceleration = ref<boolean>(general.disableHardwareAcceleration);
const hideToTrayOnClose = ref<boolean>(general.hideToTrayOnClose);
const showNotificationOnSongChange = ref<boolean>(general.showNotificationOnSongChange);
const startOnBoot = ref<boolean>(general.startOnBoot);
const startMinimized = ref<boolean>(general.startMinimized);

const alwaysShowVolumeSlider = ref<boolean>(appearance.alwaysShowVolumeSlider);
const centeredPlayerControls = ref<boolean>(appearance.centeredPlayerControls ?? false);
const customCSSEnabled = ref<boolean>(appearance.customCSSEnabled);
const customCSSPath = ref<string>(appearance.customCSSPath);
const zoom = ref<number>(appearance.zoom);
const trayIconStyle = ref<number>(appearance.trayIconStyle);
const themePreset = ref<number>(appearance.themePreset ?? ThemePreset.Midnight);
const compactMode = ref<boolean>(appearance.compactMode ?? false);

const continueWhereYouLeftOff = ref<boolean>(playback.continueWhereYouLeftOff);
const continueWhereYouLeftOffPaused = ref<boolean>(playback.continueWhereYouLeftOffPaused);
const enableSpeakerFill = ref<boolean>(playback.enableSpeakerFill);
const progressInTaskbar = ref<boolean>(playback.progressInTaskbar);
const ratioVolume = ref<boolean>(playback.ratioVolume);

const companionServerEnabled = ref<boolean>(integrations.companionServerEnabled);
const companionServerAuthTokens = ref<AuthToken[]>([]);
const companionServerCORSWildcardEnabled = ref<boolean>(integrations.companionServerCORSWildcardEnabled);
const discordPresenceEnabled = ref<boolean>(integrations.discordPresenceEnabled);
const lastFMEnabled = ref<boolean>(integrations.lastFMEnabled);
const sponsorBlockEnabled = ref<boolean>(integrations.sponsorBlockEnabled ?? false);
const sponsorBlockSkipIntros = ref<boolean>(integrations.sponsorBlockSkipIntros ?? false);
const sponsorBlockSkipOutros = ref<boolean>(integrations.sponsorBlockSkipOutros ?? false);
const nowPlayingExportEnabled = ref<boolean>(integrations.nowPlayingExportEnabled ?? false);
const listenBrainzEnabled = ref<boolean>(integrations.listenBrainzEnabled ?? false);
const listenBrainzToken = ref("");
const pluginManagerEnabled = ref<boolean>(integrations.pluginManagerEnabled ?? false);
const localTelemetryEnabled = ref<boolean>(integrations.localTelemetryEnabled ?? false);
const plugins = ref<Array<{ id: string; name: string; permissions: string[] }>>([]);
const pluginPermissionGrants = ref<Record<string, string[]>>(integrations.pluginPermissionGrants ?? {});

const shortcutPlayPause = ref<string>(shortcuts.playPause);
const shortcutNext = ref<string>(shortcuts.next);
const shortcutPrevious = ref<string>(shortcuts.previous);
const shortcutThumbsUp = ref<string>(shortcuts.thumbsUp);
const shortcutThumbsDown = ref<string>(shortcuts.thumbsDown);
const shortcutVolumeUp = ref<string>(shortcuts.volumeUp);
const shortcutVolumeDown = ref<string>(shortcuts.volumeDown);
const shortcutsVolumeDelta = ref<number>(shortcuts.volumeDelta ?? 10);
const shortcutShuffle = ref<string>(shortcuts.shuffle ?? "");
const shortcutNavigateBack = ref<string>(shortcuts.navigateBack ?? "");
const shortcutNavigateForward = ref<string>(shortcuts.navigateForward ?? "");

const lastFMSessionKey = ref<string>(lastFM.sessionKey);
const scrobblePercent = ref<number>(lastFM.scrobblePercent);

store.onDidAnyChange(async newState => {
  persistedAppearance = newState.appearance;
  persistedIntegrations = newState.integrations;
  persistedLastFM = newState.lastfm;

  disableHardwareAcceleration.value = newState.general.disableHardwareAcceleration;
  hideToTrayOnClose.value = newState.general.hideToTrayOnClose;
  showNotificationOnSongChange.value = newState.general.showNotificationOnSongChange;
  startOnBoot.value = newState.general.startOnBoot;
  startMinimized.value = newState.general.startMinimized;

  alwaysShowVolumeSlider.value = newState.appearance.alwaysShowVolumeSlider;
  centeredPlayerControls.value = newState.appearance.centeredPlayerControls ?? false;
  customCSSEnabled.value = newState.appearance.customCSSEnabled;
  customCSSPath.value = newState.appearance.customCSSPath;
  zoom.value = newState.appearance.zoom;
  trayIconStyle.value = newState.appearance.trayIconStyle;
  themePreset.value = newState.appearance.themePreset ?? ThemePreset.Midnight;
  compactMode.value = newState.appearance.compactMode ?? false;

  continueWhereYouLeftOff.value = newState.playback.continueWhereYouLeftOff;
  continueWhereYouLeftOffPaused.value = newState.playback.continueWhereYouLeftOffPaused;
  enableSpeakerFill.value = newState.playback.enableSpeakerFill;
  progressInTaskbar.value = newState.playback.progressInTaskbar;
  ratioVolume.value = newState.playback.ratioVolume;

  companionServerEnabled.value = newState.integrations.companionServerEnabled;
  if (currentTab.value === 4) await refreshCompanionTokens(newState.integrations.companionServerAuthTokens);
  companionServerCORSWildcardEnabled.value = newState.integrations.companionServerCORSWildcardEnabled;
  discordPresenceEnabled.value = newState.integrations.discordPresenceEnabled;
  lastFMEnabled.value = newState.integrations.lastFMEnabled;
  sponsorBlockEnabled.value = newState.integrations.sponsorBlockEnabled ?? false;
  sponsorBlockSkipIntros.value = newState.integrations.sponsorBlockSkipIntros ?? false;
  sponsorBlockSkipOutros.value = newState.integrations.sponsorBlockSkipOutros ?? false;
  nowPlayingExportEnabled.value = newState.integrations.nowPlayingExportEnabled ?? false;
  listenBrainzEnabled.value = newState.integrations.listenBrainzEnabled ?? false;
  pluginManagerEnabled.value = newState.integrations.pluginManagerEnabled ?? false;
  localTelemetryEnabled.value = newState.integrations.localTelemetryEnabled ?? false;
  pluginPermissionGrants.value = newState.integrations.pluginPermissionGrants ?? {};
  lastFMSessionKey.value = newState.lastfm.sessionKey;
  scrobblePercent.value = newState.lastfm.scrobblePercent;

  shortcutPlayPause.value = newState.shortcuts.playPause;
  shortcutNext.value = newState.shortcuts.next;
  shortcutPrevious.value = newState.shortcuts.previous;
  shortcutThumbsUp.value = newState.shortcuts.thumbsUp;
  shortcutThumbsDown.value = newState.shortcuts.thumbsDown;
  shortcutVolumeUp.value = newState.shortcuts.volumeUp;
  shortcutVolumeDown.value = newState.shortcuts.volumeDown;
  shortcutsVolumeDelta.value = newState.shortcuts.volumeDelta ?? 10;
  shortcutShuffle.value = newState.shortcuts.shuffle ?? "";
  shortcutNavigateBack.value = newState.shortcuts.navigateBack ?? "";
  shortcutNavigateForward.value = newState.shortcuts.navigateForward ?? "";
});

const discordPresenceConnectionFailed = ref<boolean>(await memoryStore.get("discordPresenceConnectionFailed"));

const shortcutsPlayPauseRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsPlayPauseRegisterFailed"));
const shortcutsNextRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsNextRegisterFailed"));
const shortcutsPreviousRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsPreviousRegisterFailed"));
const shortcutsThumbsUpRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsThumbsUpRegisterFailed"));
const shortcutsThumbsDownRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsThumbsDownRegisterFailed"));
const shortcutsVolumeUpRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsVolumeUpRegisterFailed"));
const shortcutsVolumeDownRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsVolumeDownRegisterFailed"));
const shortcutsShuffleRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsShuffleRegisterFailed"));
const shortcutsNavigateBackRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsNavigateBackRegisterFailed"));
const shortcutsNavigateForwardRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsNavigateForwardRegisterFailed"));

const companionServerAuthWindowEnabled = ref<boolean>(await memoryStore.get("companionServerAuthWindowEnabled"));

const autoUpdaterDisabled = ref<boolean>(await memoryStore.get("autoUpdaterDisabled"));

memoryStore.onStateChanged(newState => {
  discordPresenceConnectionFailed.value = newState.discordPresenceConnectionFailed;

  shortcutsPlayPauseRegisterFailed.value = newState.shortcutsPlayPauseRegisterFailed;
  shortcutsNextRegisterFailed.value = newState.shortcutsNextRegisterFailed;
  shortcutsPreviousRegisterFailed.value = newState.shortcutsPreviousRegisterFailed;
  shortcutsThumbsUpRegisterFailed.value = newState.shortcutsThumbsUpRegisterFailed;
  shortcutsThumbsDownRegisterFailed.value = newState.shortcutsThumbsDownRegisterFailed;
  shortcutsVolumeUpRegisterFailed.value = newState.shortcutsVolumeUpRegisterFailed;
  shortcutsVolumeDownRegisterFailed.value = newState.shortcutsVolumeDownRegisterFailed;
  shortcutsShuffleRegisterFailed.value = newState.shortcutsShuffleRegisterFailed;
  shortcutsNavigateBackRegisterFailed.value = newState.shortcutsNavigateBackRegisterFailed;
  shortcutsNavigateForwardRegisterFailed.value = newState.shortcutsNavigateForwardRegisterFailed;

  companionServerAuthWindowEnabled.value = newState.companionServerAuthWindowEnabled;

  safeStorageAvailable.value = newState.safeStorageAvailable;

  autoUpdaterDisabled.value = newState.autoUpdaterDisabled;
});

async function memorySettingsChanged() {
  memoryStore.set("companionServerAuthWindowEnabled", companionServerAuthWindowEnabled.value);
}

async function settingsChanged() {
  store.setMany({
    general: {
      hideToTrayOnClose: hideToTrayOnClose.value,
      showNotificationOnSongChange: showNotificationOnSongChange.value,
      startOnBoot: startOnBoot.value,
      startMinimized: startMinimized.value,
      disableHardwareAcceleration: disableHardwareAcceleration.value
    },
    appearance: {
      ...persistedAppearance,
      alwaysShowVolumeSlider: alwaysShowVolumeSlider.value,
      centeredPlayerControls: centeredPlayerControls.value,
      customCSSEnabled: customCSSEnabled.value,
      zoom: zoom.value,
      trayIconStyle: trayIconStyle.value,
      themePreset: themePreset.value,
      compactMode: compactMode.value
    },
    playback: {
      continueWhereYouLeftOff: continueWhereYouLeftOff.value,
      continueWhereYouLeftOffPaused: continueWhereYouLeftOffPaused.value,
      progressInTaskbar: progressInTaskbar.value,
      enableSpeakerFill: enableSpeakerFill.value,
      ratioVolume: ratioVolume.value
    },
    integrations: {
      ...persistedIntegrations,
      companionServerEnabled: companionServerEnabled.value,
      companionServerCORSWildcardEnabled: companionServerCORSWildcardEnabled.value,
      discordPresenceEnabled: discordPresenceEnabled.value,
      lastFMEnabled: lastFMEnabled.value,
      sponsorBlockEnabled: sponsorBlockEnabled.value,
      sponsorBlockSkipIntros: sponsorBlockSkipIntros.value,
      sponsorBlockSkipOutros: sponsorBlockSkipOutros.value,
      nowPlayingExportEnabled: nowPlayingExportEnabled.value,
      listenBrainzEnabled: listenBrainzEnabled.value,
      pluginManagerEnabled: pluginManagerEnabled.value,
      localTelemetryEnabled: localTelemetryEnabled.value
    },
    shortcuts: {
      playPause: shortcutPlayPause.value,
      next: shortcutNext.value,
      previous: shortcutPrevious.value,
      thumbsUp: shortcutThumbsUp.value,
      thumbsDown: shortcutThumbsDown.value,
      volumeUp: shortcutVolumeUp.value,
      volumeDown: shortcutVolumeDown.value,
      volumeDelta: shortcutsVolumeDelta.value,
      shuffle: shortcutShuffle.value,
      navigateBack: shortcutNavigateBack.value,
      navigateForward: shortcutNavigateForward.value
    },
    lastfm: {
      ...persistedLastFM,
      scrobblePercent: scrobblePercent.value
    }
  });
}

async function saveListenBrainzToken() {
  const encrypted = listenBrainzToken.value.trim() ? await safeStorage.encryptString(listenBrainzToken.value.trim()) : null;
  store.set("integrations.listenBrainzToken", encrypted);
}

async function loadListenBrainzToken() {
  if (!safeStorageAvailable.value || !integrations.listenBrainzToken) return;
  try {
    listenBrainzToken.value = await safeStorage.decryptString(integrations.listenBrainzToken);
  } catch {
    listenBrainzToken.value = "";
  }
}

watch(settingsSearch, async query => {
  await nextTick();
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>(".content .ytmd-setting").forEach(setting => {
    setting.style.display = !normalized || setting.textContent?.toLowerCase().includes(normalized) ? "" : "none";
  });
});

await loadListenBrainzToken();

async function settingChangedRequiresRestart() {
  requiresRestart.value = true;
  settingsChanged();
}

async function settingChangedFile(event: Event) {
  const target = event.target as HTMLInputElement;

  const setting = target.dataset.setting;
  if (!setting) {
    throw new Error("No setting specified in File Input");
  }

  store.set(setting, target.files.length > 0 ? window.ytmd.getTrueFilePath(target.files[0]) : null);

  target.value = null;
}

async function restartDiscordPresence() {
  discordPresenceEnabled.value = false;
  await settingsChanged();
  discordPresenceEnabled.value = true;
  await settingsChanged();
}

async function deleteCompanionAuthToken(appId: string) {
  const index = companionServerAuthTokens.value.findIndex(token => token.appId === appId);
  if (index > -1) {
    companionServerAuthTokens.value.splice(index, 1);
  }

  if (safeStorageAvailable.value)
    store.set("integrations.companionServerAuthTokens", await safeStorage.encryptString(JSON.stringify(companionServerAuthTokens.value)));
}

function removeCustomCSSPath() {
  store.set("appearance.customCSSPath", null);
}

async function refreshCompanionTokens(encryptedTokens = integrations.companionServerAuthTokens) {
  if (!safeStorageAvailable.value || !encryptedTokens) {
    companionServerAuthTokens.value = [];
    return;
  }

  try {
    companionServerAuthTokens.value = parseAuthTokens(await safeStorage.decryptString(encryptedTokens));
  } catch (error) {
    console.warn("Authorized companion data is unavailable", error);
    companionServerAuthTokens.value = [];
  }
}

async function changeTab(newTab: number) {
  currentTab.value = newTab;
  if (newTab === 4) {
    await refreshCompanionTokens();
    plugins.value = await window.ytmd.listPlugins();
  }
}

function pluginPermissionGranted(pluginId: string, permission: string) {
  return pluginPermissionGrants.value[pluginId]?.includes(permission) ?? false;
}

function setPluginPermission(pluginId: string, permission: string, enabled: boolean) {
  const grants = { ...pluginPermissionGrants.value };
  const current = new Set(grants[pluginId] ?? []);
  if (enabled) current.add(permission);
  else current.delete(permission);
  grants[pluginId] = [...current];
  pluginPermissionGrants.value = grants;
  store.set("integrations.pluginPermissionGrants", grants);
}

function handlePluginPermission(event: Event, pluginId: string, permission: string) {
  setPluginPermission(pluginId, permission, (event.target as HTMLInputElement).checked);
}

function restartApplication() {
  window.ytmd.restartApplication();
}

function restartApplicationForUpdate() {
  window.ytmd.restartApplicationForUpdate();
}

function checkForUpdates() {
  window.ytmd.checkForUpdates();
  checkingForUpdate.value = true;
}

async function logoutLastFM() {
  store.set("lastfm.sessionKey", null);
  lastFMEnabled.value = false;
  lastFMSessionKey.value = null;
  await settingsChanged();
}

window.ytmd.handleCheckingForUpdate(() => {
  checkingForUpdate.value = true;
});

window.ytmd.handleUpdateAvailable(() => {
  checkingForUpdate.value = false;
  updateAvailable.value = true;
  updateNotAvailable.value = false;
});

window.ytmd.handleUpdateNotAvailable(() => {
  checkingForUpdate.value = false;
  updateNotAvailable.value = true;
  updateAvailable.value = false;
});

window.ytmd.handleUpdateDownloaded(() => {
  checkingForUpdate.value = false;
  updateNotAvailable.value = false;
  updateAvailable.value = false;
  updateDownloaded.value = true;
});
</script>

<template>
  <div class="settings-container">
    <div class="content-container">
      <ul class="sidebar">
        <li class="brand" aria-hidden="true"><span class="brand-mark material-symbols-outlined">graphic_eq</span><span>YTM Desktop</span></li>
        <li>
          <button :class="{ active: currentTab === 1 }" @click="changeTab(1)">
            <span class="material-symbols-outlined">settings_applications</span>General
          </button>
        </li>
        <li>
          <button :class="{ active: currentTab === 2 }" @click="changeTab(2)"><span class="material-symbols-outlined">brush</span>Appearance</button>
        </li>
        <li>
          <button :class="{ active: currentTab === 3 }" @click="changeTab(3)"><span class="material-symbols-outlined">music_note</span>Playback</button>
        </li>
        <li>
          <button :class="{ active: currentTab === 4 }" @click="changeTab(4)"><span class="material-symbols-outlined">wifi_tethering</span>Integrations</button>
        </li>
        <li>
          <button :class="{ active: currentTab === 5 }" @click="changeTab(5)"><span class="material-symbols-outlined">keyboard</span>Shortcuts</button>
        </li>
        <li class="push"></li>
        <li>
          <button :class="{ active: currentTab === 99 }" @click="changeTab(99)"><span class="material-symbols-outlined">info</span>About</button>
        </li>
      </ul>
      <div class="content">
        <div class="settings-search">
          <span class="material-symbols-outlined">search</span>
          <input v-model="settingsSearch" type="search" placeholder="Search settings" aria-label="Search settings" />
        </div>
        <header v-if="currentTab !== 99" class="page-heading">
          <h1>{{ tabMeta[currentTab].title }}</h1>
          <p>{{ tabMeta[currentTab].description }}</p>
        </header>
        <div v-if="requiresRestart" class="restart-banner">
          <p class="message"><span class="material-symbols-outlined">autorenew</span> Restart app to apply changes</p>
          <button class="restart-button" @click="restartApplication">Restart</button>
        </div>
        <div v-if="currentTab === 1 || settingsSearch.trim()" class="general-tab">
          <YTMDSetting
            v-if="!isDarwin"
            v-model="hideToTrayOnClose"
            type="checkbox"
            name="Keep playing in the tray"
            description="Closing the window keeps your music running in the background."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="showNotificationOnSongChange"
            type="checkbox"
            name="Now playing notifications"
            description="Show the track and artist when the song changes."
            @change="settingsChanged"
          />
          <YTMDSetting v-model="startOnBoot" type="checkbox" name="Start with your computer" @change="settingsChanged" />
          <YTMDSetting
            v-model="startMinimized"
            type="checkbox"
            name="Start minimized"
            description="Launch quietly without opening the player window."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="disableHardwareAcceleration"
            type="checkbox"
            restart-required
            name="Disable hardware acceleration"
            description="Use software rendering only when graphics problems occur. This may reduce performance."
            @change="settingChangedRequiresRestart"
          />
        </div>

        <div v-if="currentTab === 2 || settingsSearch.trim()" class="appearance-tab">
          <YTMDSetting
            v-model="themePreset"
            :options-map="{
              [ThemePreset.Midnight]: 'Midnight',
              [ThemePreset.OLED]: 'OLED black',
              [ThemePreset.Ocean]: 'Ocean blue',
              [ThemePreset.Violet]: 'Electric violet'
            }"
            type="select"
            name="Theme preset"
            description="Apply a polished built-in colour palette instantly."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="compactMode"
            type="checkbox"
            name="Compact mini-player"
            description="Keep a small always-on-top player focused on the current track and controls."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="alwaysShowVolumeSlider"
            type="checkbox"
            name="Always show volume slider"
            description="Keep volume controls visible in the player bar."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="centeredPlayerControls"
            type="checkbox"
            name="Center player controls"
            description="Keep playback buttons centered independently of track information."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="customCSSEnabled"
            type="checkbox"
            name="Custom CSS"
            description="Apply your own stylesheet to YouTube Music."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="customCSSEnabled"
            v-model="customCSSPath"
            type="file"
            indented
            bind-setting="appearance.customCSSPath"
            name="Custom CSS file path"
            @file-change="settingChangedFile"
            @clear="removeCustomCSSPath"
          />
          <YTMDSetting v-model="zoom" type="range" max="200" min="50" step="10" name="Interface scale (%)" @change="settingsChanged" />
          <YTMDSetting
            v-if="isLinux"
            v-model="trayIconStyle"
            :options-map="{ [TrayIconStyle.Auto]: 'Auto', [TrayIconStyle.White]: 'White', [TrayIconStyle.Black]: 'Black' }"
            type="select"
            name="Tray icon style"
            @change="settingsChanged"
          />
        </div>

        <div v-if="currentTab === 3 || settingsSearch.trim()" class="playback-tab">
          <div class="quality-card">
            <span class="material-symbols-outlined">high_quality</span>
            <div>
              <strong>Best available source quality</strong>
              <p>
                YTM Desktop uses YouTube Music's highest stream available to your account. Premium supports up to 256 kbps AAC/Opus; the original upload and
                your connection can set a lower limit.
              </p>
              <small>Keep hardware acceleration enabled and Speaker fill off for the cleanest, unprocessed playback.</small>
            </div>
          </div>
          <YTMDSetting
            v-model="continueWhereYouLeftOff"
            name="Resume your session"
            description="Open YouTube Music where you left off."
            type="checkbox"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="continueWhereYouLeftOff"
            v-model="continueWhereYouLeftOffPaused"
            type="checkbox"
            indented
            name="Pause on application launch"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="progressInTaskbar"
            type="checkbox"
            name="Show track progress on taskbar"
            description="See playback progress without bringing the app forward."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="enableSpeakerFill"
            type="checkbox"
            restart-required
            name="Speaker fill"
            description="Use a wider channel mix for multi-speaker setups."
            @change="settingChangedRequiresRestart"
          />
          <YTMDSetting
            v-model="ratioVolume"
            type="checkbox"
            name="Perceptual volume"
            description="Use a smoother volume curve for finer low-volume control."
            @change="settingsChanged"
          />
        </div>

        <div v-if="currentTab === 4 || settingsSearch.trim()" class="integrations-tab">
          <div class="integration-intro">
            <span class="material-symbols-outlined">developer_board</span>
            <div>
              <strong>Stream Deck & companion API</strong>
              <p>Local API available at <code>127.0.0.1:9863</code> while the companion server is enabled.</p>
            </div>
          </div>
          <YTMDSetting
            v-model="companionServerEnabled"
            type="checkbox"
            name="Companion and plugin server"
            :disabled="!safeStorageAvailable"
            disabled-message="This integration cannot be enabled due to safeStorage being unavailable"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="sponsorBlockEnabled"
            type="checkbox"
            name="SponsorBlock"
            description="Automatically skip community-marked sponsor segments. No playback history is retained by YTM Desktop."
            @change="settingsChanged"
          />
          <YTMDSetting v-if="sponsorBlockEnabled" v-model="sponsorBlockSkipIntros" type="checkbox" indented name="Also skip intros" @change="settingsChanged" />
          <YTMDSetting v-if="sponsorBlockEnabled" v-model="sponsorBlockSkipOutros" type="checkbox" indented name="Also skip outros" @change="settingsChanged" />
          <YTMDSetting
            v-model="nowPlayingExportEnabled"
            type="checkbox"
            name="Now-playing export"
            description="Write now-playing.json and now-playing.txt locally for OBS, Stream Deck, and automation tools."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-model="listenBrainzEnabled"
            type="checkbox"
            name="ListenBrainz scrobbling"
            description="Send playing-now and completed listens using your securely stored token."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="listenBrainzEnabled"
            v-model="listenBrainzToken"
            type="password"
            indented
            name="ListenBrainz user token"
            description="Encrypted using your operating system's secure storage."
            :disabled="!safeStorageAvailable"
            disabled-message="Secure storage is unavailable on this system."
            @change="saveListenBrainzToken"
          />
          <YTMDSetting
            v-model="pluginManagerEnabled"
            type="checkbox"
            name="Permission-gated plugin manager"
            description="Allow declarative plugins only after their requested capabilities are explicitly approved. Unrestricted Node code is never loaded."
            @change="settingsChanged"
          />
          <div v-if="pluginManagerEnabled" class="plugin-list">
            <p v-if="plugins.length === 0" class="empty-plugins">No valid plugin manifests found. Add declarative manifests to the app-data plugins folder.</p>
            <article v-for="plugin in plugins" :key="plugin.id" class="plugin-card">
              <strong>{{ plugin.name }}</strong>
              <span>{{ plugin.id }}</span>
              <label v-for="permission in plugin.permissions" :key="permission">
                <input
                  type="checkbox"
                  :checked="pluginPermissionGranted(plugin.id, permission)"
                  @change="handlePluginPermission($event, plugin.id, permission)"
                />
                <span
                  ><b>{{ permission }}</b> — approve this capability</span
                >
              </label>
            </article>
          </div>
          <YTMDSetting
            v-model="localTelemetryEnabled"
            type="checkbox"
            name="Local performance telemetry"
            description="Optionally store aggregate startup, buffering, and playback counters on this device. Nothing is transmitted."
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            v-model="companionServerCORSWildcardEnabled"
            type="checkbox"
            indented
            name="Allow browser communication"
            description="This setting could be dangerous as it allows any website you visit to communicate with the companion server"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            v-model="companionServerAuthWindowEnabled"
            type="checkbox"
            indented
            name="Pair a Stream Deck or companion"
            description="Open pairing for five minutes, then start authorization from your Stream Deck plugin or companion app."
            @change="memorySettingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            type="custom"
            flex-column
            indented
            name="Authorized companions"
            description="This is a list of companions that currently have access to the companion server"
            @change="settingsChanged"
          >
            <table class="authorized-companions-table">
              <thead>
                <tr>
                  <th class="companion">Companion</th>
                  <th class="version">Version</th>
                  <th class="controls"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="authToken in companionServerAuthTokens" :key="authToken.appId">
                  <td class="companion">
                    <span class="name">{{ authToken.appName }}</span
                    ><br />
                    <span class="id">{{ authToken.appId }}</span>
                  </td>
                  <td class="version">{{ authToken.appVersion }}</td>
                  <td class="controls">
                    <button @click="deleteCompanionAuthToken(authToken.appId)"><span class="material-symbols-outlined">delete</span></button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="companionServerAuthTokens.length === 0" class="no-authorized-companions">
              <td>No authorized companions</td>
            </div>
          </YTMDSetting>
          <YTMDSetting v-model="discordPresenceEnabled" type="checkbox" name="Discord rich presence" @change="settingsChanged" />
          <div v-if="discordPresenceEnabled && discordPresenceConnectionFailed" class="setting indented">
            <p class="discord-failure">Discord connection could not be established after 30 attempts</p>
            <button @click="restartDiscordPresence">Retry</button>
          </div>
          <YTMDSetting
            v-model="lastFMEnabled"
            type="checkbox"
            name="Last.fm scrobbling"
            :disabled="!safeStorageAvailable"
            disabled-message="This integration cannot be enabled due to safeStorage being unavailable"
            @change="settingsChanged"
          />
          <div v-if="lastFMEnabled" class="setting indented">
            <div class="name-with-description">
              <p class="description">
                User is Authenticated:
                <span v-if="lastFMSessionKey" style="color: #4caf50">Yes</span>
                <span v-else style="color: #ff1100">No</span>
              </p>
            </div>
            <button v-if="lastFMSessionKey" @click="logoutLastFM">Logout</button>
          </div>
          <YTMDSetting
            v-if="lastFMEnabled"
            v-model="scrobblePercent"
            class="settings indented"
            type="range"
            name="Scrobble percent"
            description="Determines when a song is scrobbled"
            min="50"
            max="95"
            step="5"
            @change="settingsChanged"
          />
        </div>

        <div v-if="currentTab === 5 || settingsSearch.trim()" class="shortcuts-tab">
          <div class="setting">
            <p class="shortcut-title">
              Play/Pause<span
                v-if="shortcutsPlayPauseRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutPlayPause" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">Shuffle<span v-if="shortcutsShuffleRegisterFailed" class="material-symbols-outlined register-error">error</span></p>
            <KeybindInput v-model="shortcutShuffle" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Navigate back<span v-if="shortcutsNavigateBackRegisterFailed" class="material-symbols-outlined register-error">error</span>
            </p>
            <KeybindInput v-model="shortcutNavigateBack" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Navigate forward<span v-if="shortcutsNavigateForwardRegisterFailed" class="material-symbols-outlined register-error">error</span>
            </p>
            <KeybindInput v-model="shortcutNavigateForward" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Next<span
                v-if="shortcutsNextRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutNext" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Previous<span
                v-if="shortcutsPreviousRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutPrevious" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Thumbs Up<span
                v-if="shortcutsThumbsUpRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutThumbsUp" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Thumbs Down<span
                v-if="shortcutsThumbsDownRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutThumbsDown" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Increase Volume<span
                v-if="shortcutsVolumeUpRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutVolumeUp" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Decrease Volume<span
                v-if="shortcutsVolumeDownRegisterFailed"
                class="material-symbols-outlined register-error"
                title="Failed to register keybind. Does another application have this keybind?"
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutVolumeDown" @change="settingsChanged" />
          </div>
          <YTMDSetting
            v-model="shortcutsVolumeDelta"
            type="range"
            max="20"
            min="1"
            step="1"
            name="Volume step (%)"
            description="Amount changed by volume shortcuts and companion controls."
            @change="settingsChanged"
          />
        </div>

        <div v-if="currentTab === 99" class="about-tab">
          <img class="icon" :src="logo" />
          <h2 class="app-name">YTM Desktop</h2>
          <p class="made-by">Created and maintained by AaranCloud</p>
          <template v-if="!autoUpdaterDisabled">
            <button
              v-if="!updateDownloaded"
              :disabled="!(!checkingForUpdate && !updateAvailable && !updateDownloaded)"
              class="update-check-button"
              @click="checkForUpdates"
            >
              <span class="material-symbols-outlined">update</span>Check for updates
            </button>
            <button v-if="updateDownloaded" class="update-button" @click="restartApplicationForUpdate">
              <span class="material-symbols-outlined">upgrade</span>Restart to update
            </button>
            <p v-if="checkingForUpdate && !updateAvailable && !updateDownloaded" class="updating">
              <span class="material-symbols-outlined">progress_activity</span>Checking for updates...
            </p>
            <p v-if="updateAvailable && !updateDownloaded" class="updating">
              <span class="material-symbols-outlined">progress_activity</span>Downloading update...
            </p>
            <p v-if="updateNotAvailable" class="no-update">Update not available</p>
          </template>
          <template v-if="autoUpdaterDisabled">
            <button disabled class="update-check-button"><span class="material-symbols-outlined">update</span>Check for updates</button>
            <p class="no-auto-updater">Auto updater disabled</p>
          </template>
          <span class="version-info">
            <p class="version">Version: {{ ytmdVersion }}</p>
            <p class="branch">Branch: {{ ytmdBranch }}</p>
            <p class="commit">Commit: {{ ytmdCommitHash }}</p>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  user-select: none;
  height: 100%;
}

.content-container {
  display: flex;
  height: 100%;
}

.content {
  overflow: auto;
  flex-grow: 1;
  padding: 30px clamp(24px, 5vw, 64px) 44px;
  background: radial-gradient(circle at 100% 0%, rgba(184, 43, 67, 0.1), transparent 28%);
}

.content::-webkit-scrollbar {
  width: 12px;
}

.content::-webkit-scrollbar-track {
  background: transparent;
}

.content::-webkit-scrollbar-thumb {
  background-color: #3a3740;
  border: 3px solid #0d0d13;
  border-radius: 99px;
}

.sidebar {
  width: 242px;
  min-width: 242px;
  list-style-type: none;
  margin: unset;
  padding: unset;
  height: 100%;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: #111117;
  display: flex;
  flex-direction: column;
}

.sidebar li:not(.brand) {
  margin: 2px 10px;
}

.sidebar li button {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 11px 18px;
  margin: 0;
  border-radius: 9px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: #a9a7af;
  font-size: 14px;
  font-weight: 500;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.sidebar .brand {
  margin: 10px 10px 18px;
  padding: 12px 8px;
  color: #f5f1f3;
  cursor: default;
  font-size: 15px;
  font-weight: 650;
}

.brand-mark {
  color: #ff5261;
  margin-right: 10px;
}

.sidebar li button .material-symbols-outlined {
  font-size: 21px;
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" 0,
    "opsz" 28;
}

.sidebar li button:hover {
  background-color: rgba(255, 255, 255, 0.06);
  color: #f5f2f4;
}

.sidebar li button.active {
  background: linear-gradient(90deg, rgba(235, 52, 72, 0.22), rgba(235, 52, 72, 0.07));
  color: #fff7f8;
}

.sidebar li button .material-symbols-outlined {
  margin-right: 8px;
}

.sidebar .push {
  flex-grow: 1;
}

.page-heading {
  margin: 0 0 20px;
}
.page-heading h1 {
  margin: 0 0 6px;
  font-size: 26px;
  letter-spacing: -0.035em;
}
.page-heading p {
  margin: 0;
  color: #aaa6af;
  font-size: 14px;
}

.settings-search {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 760px;
  margin: 0 0 18px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  background: rgba(19, 18, 24, 0.94);
  backdrop-filter: blur(18px);
}

.settings-search .material-symbols-outlined {
  color: #8e8994;
}

.settings-search input {
  width: 100%;
  border: 0;
  outline: 0;
  color: #fff;
  background: transparent;
  font: inherit;
}

.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.general-tab,
.appearance-tab,
.playback-tab,
.integrations-tab,
.shortcuts-tab {
  max-width: 760px;
  padding: 4px 20px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 14px;
}

.integration-intro {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: 16px 0 6px;
  padding: 14px;
  border: 1px solid rgba(255, 82, 97, 0.22);
  border-radius: 11px;
  background: rgba(255, 82, 97, 0.07);
}

.integration-intro > .material-symbols-outlined {
  color: #ff5261;
  font-size: 28px;
}
.integration-intro p {
  margin: 4px 0 0;
  color: #aaa6af;
  font-size: 12px;
}
.integration-intro code {
  color: #ddd9df;
  user-select: text;
}

.quality-card {
  display: flex;
  gap: 15px;
  margin: 16px 0 6px;
  padding: 17px 18px;
  border: 1px solid rgba(255, 49, 95, 0.24);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 0, 64, 0.12), rgba(106, 80, 255, 0.08));
}

.quality-card > .material-symbols-outlined {
  color: #ff315f;
  font-size: 26px;
}

.quality-card strong {
  display: block;
  margin-bottom: 5px;
  color: #fff;
  font-size: 14px;
}

.quality-card p,
.quality-card small {
  display: block;
  margin: 0;
  color: #aaa6af;
  line-height: 1.5;
}

.plugin-list {
  padding: 10px 0 14px;
}

.empty-plugins {
  color: #817d86;
  font-size: 12px;
}

.plugin-card {
  display: grid;
  gap: 7px;
  margin: 8px 0;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.025);
}

.plugin-card > span {
  color: #817d86;
  font-size: 11px;
}

.plugin-card label {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #aaa6af;
  font-size: 12px;
}

.quality-card small {
  margin-top: 7px;
  color: #817d86;
}

.setting.indented {
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid #212121;
}

.name-with-description .name {
  margin-bottom: unset;
}

.name-with-description .description {
  margin-top: 4px;
  color: #969696;
}

.about-tab {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  height: 100%;
  max-width: 520px;
  max-height: 620px;
  margin: auto;
  padding: 36px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015));
}

.icon {
  width: 96px;
  height: 96px;
  margin-bottom: 16px;
}

.app-name {
  margin: 0;
  letter-spacing: -0.035em;
}

.version-info .version,
.version-info .branch,
.version-info .commit {
  margin: 4px 0;
  color: #bbbbbb;
}

.made-by {
  margin: 16px 0;
}

.restart-banner {
  max-width: 760px;
  margin: 0 0 16px;
  border-radius: 10px;
  background: linear-gradient(100deg, #d83345, #f04a59);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.restart-banner .message {
  display: flex;
  align-items: center;
}

.restart-banner .message .material-symbols-outlined {
  margin: 0 8px;
}

.restart-banner .restart-button {
  margin: 0 8px;
  background-color: transparent;
  border: 1px solid #ffffff;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
}

.update-check-button {
  display: flex;
  align-items: center;
  background-color: transparent;
  border: 1px solid #ffffff;
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 8px;
  cursor: pointer;
}

.update-check-button:disabled {
  border: 1px solid #888888;
  cursor: not-allowed;
}

.updating,
.no-update {
  display: flex;
  align-items: center;
  color: #888888;
  margin: 0 0 8px 0;
}

.no-auto-updater {
  display: flex;
  align-items: center;
  color: #888888;
  margin: 0 0 8px 0;
}

.updating .material-symbols-outlined {
  animation: rotation 1s infinite linear;
}

@keyframes rotation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(359deg);
  }
}

.update-button {
  display: flex;
  align-items: center;
  background-color: #f44336;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 8px;
  cursor: pointer;
}

.update-check-button .material-symbols-outlined,
.updating .material-symbols-outlined,
.update-button .material-symbols-outlined {
  margin-right: 4px;
}

.version-info {
  user-select: text;
}

.setting.disabled {
  color: #c6c6c6;
}

.authorized-companions-table {
  width: 100%;
  table-layout: fixed;
}

.authorized-companions-table tr .companion {
  width: 70%;
  word-wrap: break-word;
}

.authorized-companions-table tr .companion .id {
  color: #969696;
  font-size: 14px;
}

.authorized-companions-table tbody tr .version {
  word-wrap: break-word;
}

.authorized-companions-table tr th,
.authorized-companions-table tr td {
  padding: 4px;
}

.authorized-companions-table th {
  text-align: left;
}

.authorized-companions-table thead tr th {
  border-bottom: 1px solid #212121;
}
.authorized-companions-table thead tr .controls {
  width: 48px;
}

.authorized-companions-table tbody button {
  border-radius: 4px;
  padding: 4px;
  display: flex;
  align-items: center;
  background-color: #212121;
  cursor: pointer;
  border: none;
}

.no-authorized-companions {
  color: #bbbbbb;
  padding: 4px;
}

.discord-failure {
  margin: 0;
  color: #969696;
}

button {
  margin: 3px 3px 3px 4px;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  align-items: center;
  background-color: #29262e;
  cursor: pointer;
  border: none;
}

button:hover {
  background-color: #3a3640;
}

.shortcuts-tab .shortcut-title {
  display: flex;
  justify-content: center;
  align-items: center;
}

.shortcuts-tab .shortcut-title .register-error {
  margin-left: 4px;
  color: #f44336;
}
</style>
