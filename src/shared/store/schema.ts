export enum TrayIconStyle {
  Auto = 0,
  White = 1,
  Black = 2
}

export enum ThemePreset {
  Midnight = 0,
  OLED = 1,
  Ocean = 2,
  Violet = 3
}

export type StoreSchema = {
  metadata: {
    version: 1;
  };
  general: {
    disableHardwareAcceleration: boolean;
    hideToTrayOnClose: boolean;
    showNotificationOnSongChange: boolean;
    startOnBoot: boolean;
    startMinimized: boolean;
  };
  appearance: {
    alwaysShowVolumeSlider: boolean;
    centeredPlayerControls: boolean;
    customCSSEnabled: boolean;
    customCSSPath: string | null;
    zoom: number;
    trayIconStyle: TrayIconStyle;
    themePreset: ThemePreset;
    compactMode: boolean;
  };
  playback: {
    continueWhereYouLeftOff: boolean;
    continueWhereYouLeftOffPaused: boolean;
    enableSpeakerFill: boolean;
    progressInTaskbar: boolean;
    ratioVolume: boolean;
  };
  integrations: {
    companionServerEnabled: boolean;
    companionServerAuthTokens: string | null; // array[object] | Encrypted for security
    companionServerCORSWildcardEnabled: boolean;
    discordPresenceEnabled: boolean;
    lastFMEnabled: boolean;
    sponsorBlockEnabled: boolean;
    sponsorBlockSkipIntros: boolean;
    sponsorBlockSkipOutros: boolean;
    nowPlayingExportEnabled: boolean;
    listenBrainzEnabled: boolean;
    listenBrainzToken: string | null;
    pluginManagerEnabled: boolean;
    pluginPermissionGrants: Record<string, string[]>;
    localTelemetryEnabled: boolean;
  };
  shortcuts: {
    playPause: string;
    next: string;
    previous: string;
    thumbsUp: string;
    thumbsDown: string;
    volumeUp: string;
    volumeDown: string;
    volumeDelta: number;
    shuffle: string;
    navigateBack: string;
    navigateForward: string;
  };
  state: {
    lastUrl: string;
    lastPlaylistId: string;
    lastVideoId: string;
    lastVideoProgress: number;
    windowBounds: Electron.Rectangle | null;
    windowMaximized: boolean;
  };
  lastfm: {
    api_key: string;
    secret: string;
    token: string | null;
    sessionKey: string | null;
    scrobblePercent: number;
  };
  developer: {
    enableDevTools: boolean;
  };
};

export type MemoryStoreSchema = {
  discordPresenceConnectionFailed: boolean;
  shortcutsPlayPauseRegisterFailed: boolean;
  shortcutsNextRegisterFailed: boolean;
  shortcutsPreviousRegisterFailed: boolean;
  shortcutsThumbsUpRegisterFailed: boolean;
  shortcutsThumbsDownRegisterFailed: boolean;
  shortcutsVolumeUpRegisterFailed: boolean;
  shortcutsVolumeDownRegisterFailed: boolean;
  shortcutsShuffleRegisterFailed: boolean;
  shortcutsNavigateBackRegisterFailed: boolean;
  shortcutsNavigateForwardRegisterFailed: boolean;
  companionServerAuthWindowEnabled: boolean;
  safeStorageAvailable: boolean;
  autoUpdaterDisabled: boolean;
  ytmViewLoadTimedout: boolean;
  ytmViewLoading: boolean;
  ytmViewLoadingError: boolean;
  ytmViewLoadingStatus: string;
  ytmViewUnresponsive: boolean;
  appUpdateAvailable: boolean;
  appUpdateDownloaded: boolean;
};
