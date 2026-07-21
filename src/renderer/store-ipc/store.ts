import { ipcRenderer } from "electron";

if (process.type !== "renderer") {
  throw new Error("This module can only be used from the renderer process");
}

export default class Store<TSchema> {
  public set(key: string, value?: unknown) {
    return ipcRenderer.send("settings:set", key, value);
  }

  public async get(key: keyof TSchema) {
    return await ipcRenderer.invoke("settings:get", key);
  }

  public reset(key: keyof TSchema) {
    return ipcRenderer.send("settings:reset", key);
  }

  public onDidAnyChange(callback: (newState: TSchema, oldState: TSchema) => void) {
    const listener = (_event: Electron.IpcRendererEvent, newState: TSchema, oldState: TSchema) => {
      callback(newState, oldState);
    };
    ipcRenderer.on("settings:stateChanged", listener);
    return () => ipcRenderer.removeListener("settings:stateChanged", listener);
  }
}
