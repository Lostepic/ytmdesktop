// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";
import { WindowsEventArguments } from "~shared/types";
import { MemoryStoreSchema } from "~shared/store/schema";
import MemoryStore from "../../store-ipc/memory-store";
import type { SmallDisplayPlayer, SmallDisplayPresentation, SmallDisplayCommand, SmallDisplayQueue, SmallDisplayBrowsePage } from "~shared/small-display";

const memoryStore = new MemoryStore<MemoryStoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  smallDisplay: {
    sandboxed: process.sandboxed === true,
    getPresentation: (): Promise<SmallDisplayPresentation> => ipcRenderer.invoke("smallDisplay:getPresentation"),
    getState: (): Promise<SmallDisplayPlayer> => ipcRenderer.invoke("smallDisplay:getState"),
    setMode: (enabled: boolean) => ipcRenderer.send("smallDisplay:setMode", enabled),
    browse: (browsing: boolean) => ipcRenderer.send("smallDisplay:browse", browsing),
    browsePage: (page: SmallDisplayBrowsePage) => ipcRenderer.send("smallDisplay:browsePage", page),
    search: (query: string) => ipcRenderer.send("smallDisplay:search", query),
    back: () => ipcRenderer.send("smallDisplay:back"),
    fullscreen: () => ipcRenderer.send("smallDisplay:fullscreen"),
    chooseDisplay: () => ipcRenderer.send("smallDisplay:chooseDisplay"),
    watchQueue: (open: boolean) => ipcRenderer.send("smallDisplay:watchQueue", open),
    playQueueItem: (index: number, id: string) => ipcRenderer.send("smallDisplay:playQueueItem", index, id),
    onQueue: (callback: (value: SmallDisplayQueue) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: SmallDisplayQueue) => callback(value);
      ipcRenderer.on("smallDisplay:queue", listener);
      return () => ipcRenderer.removeListener("smallDisplay:queue", listener);
    },
    command: (command: SmallDisplayCommand, value?: number | string) => ipcRenderer.send("smallDisplay:command", command, value),
    onPresentation: (callback: (value: SmallDisplayPresentation) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: SmallDisplayPresentation) => callback(value);
      ipcRenderer.on("smallDisplay:presentation", listener);
      return () => ipcRenderer.removeListener("smallDisplay:presentation", listener);
    },
    onState: (callback: (value: SmallDisplayPlayer) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: SmallDisplayPlayer) => callback(value);
      ipcRenderer.on("smallDisplay:state", listener);
      return () => ipcRenderer.removeListener("smallDisplay:state", listener);
    }
  },
  minimizeWindow: () => ipcRenderer.send("mainWindow:minimize"),
  maximizeWindow: () => ipcRenderer.send("mainWindow:maximize"),
  restoreWindow: () => ipcRenderer.send("mainWindow:restore"),
  closeWindow: () => ipcRenderer.send("mainWindow:close"),
  handleWindowEvents: (callback: (event: Electron.IpcRendererEvent, args: WindowsEventArguments) => void) => {
    ipcRenderer.on("mainWindow:stateChanged", callback);
    return () => ipcRenderer.removeListener("mainWindow:stateChanged", callback);
  },
  requestWindowState: () => ipcRenderer.send("mainWindow:requestWindowState"),
  openSettingsWindow: () => ipcRenderer.send("settingsWindow:open"),
  switchFocus: (context: string) => ipcRenderer.send("ytmView:switchFocus", context),
  ytmViewNavigateDefault: () => ipcRenderer.send("ytmView:navigateDefault"),
  ytmViewRecreate: () => ipcRenderer.send("ytmView:recreate"),
  openCurrentSongInBrowser: () => ipcRenderer.send("ytmView:openCurrentSongInBrowser"),
  memoryStore: {
    set: (key: string, value: unknown) => memoryStore.set(key, value),
    get: async (key: keyof MemoryStoreSchema) => await memoryStore.get(key),
    onStateChanged: (callback: (newState: MemoryStoreSchema, oldState: MemoryStoreSchema) => void) => memoryStore.onStateChanged(callback)
  },
  restartApplicationForUpdate: () => ipcRenderer.send("app:restartApplicationForUpdate")
});
