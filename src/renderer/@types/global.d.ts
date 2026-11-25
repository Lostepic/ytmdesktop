import { WindowsEventArguments } from "~shared/types";
import Store from "../store-ipc/store";
import { StoreSchema, MemoryStoreSchema } from "~shared/store/schema";
import MemoryStore from "../store-ipc/memory-store";
import type { SmallDisplayPlayer, SmallDisplayPresentation, SmallDisplayCommand, SmallDisplayQueue, SmallDisplayBrowsePage } from "~shared/small-display";

declare global {
  interface Window {
    ytmd: {
      // Settings specific
      isDarwin: boolean;
      isLinux: boolean;
      isWindows: boolean;
      store: Store<StoreSchema>;
      memoryStore: MemoryStore<MemoryStoreSchema>;
      safeStorage: {
        decryptString(value: string | null): Promise<string | null>;
        encryptString(value: string): Buffer;
      };
      openSettingsWindow(): void;
      restartApplication(): void;
      restartApplicationForUpdate(): void;
      getTrueFilePath(file: File): string;
      listPlugins(): Promise<Array<{ id: string; name: string; permissions: string[] }>>;

      // Companion Authorization specific
      sendResult(authorized: boolean);
      getAppName(): string;
      getCode(): string;

      // Main window specific
      smallDisplay: {
        sandboxed: boolean;
        getPresentation(): Promise<SmallDisplayPresentation>;
        getState(): Promise<SmallDisplayPlayer>;
        setMode(enabled: boolean): void;
        browse(browsing: boolean): void;
        browsePage(page: SmallDisplayBrowsePage): void;
        search(query: string): void;
        back(): void;
        fullscreen(): void;
        chooseDisplay(): void;
        watchQueue(open: boolean): void;
        playQueueItem(index: number, id: string): void;
        onQueue(callback: (value: SmallDisplayQueue) => void): () => void;
        command(command: SmallDisplayCommand, value?: number | string): void;
        onPresentation(callback: (value: SmallDisplayPresentation) => void): () => void;
        onState(callback: (value: SmallDisplayPlayer) => void): () => void;
      };
      switchFocus(context: "main" | "ytm"): void;

      // YTM view specific
      ytmViewNavigateDefault(): void;
      ytmViewRecreate(): void;
      openCurrentSongInBrowser(): void;

      // Window control
      minimizeWindow(): void;
      maximizeWindow(): void;
      restoreWindow(): void;
      closeWindow(): void;
      handleWindowEvents(callback: (event: Electron.IpcRendererEvent, args: WindowsEventArguments) => void): () => void;
      requestWindowState(): void;

      // App specific
      getAppVersion(): Promise<string>;
      openRepository(): void;
      checkForUpdates(): void;
      handleCheckingForUpdate(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateAvailable(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateNotAvailable(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateError(callback: (event: Electron.IpcRendererEvent) => void);
      handleUpdateDownloaded(callback: (event: Electron.IpcRendererEvent) => void);
      isAppUpdateAvailable(): Promise<boolean>;
      isAppUpdateDownloaded(): Promise<boolean>;
    };
  }

  // Fixes the navigator type to include windowControlsOverlay
  interface Navigator {
    windowControlsOverlay?: {
      visible: boolean;
      addEventListener(event: "geometrychange", listener: (event: { visible: boolean }) => void);
    };
  }
}
