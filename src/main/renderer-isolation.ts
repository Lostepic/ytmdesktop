import type { App, WebPreferences } from "electron";

export const isolatedRendererPreferences = Object.freeze({
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
} satisfies WebPreferences);

export function configureRendererIsolation(application: App, platform = process.platform): void {
  // On Windows the process-wide --enable-sandbox switch can crash before the
  // first page starts. Every app window and view uses the explicit sandboxed
  // preferences above instead. Electron also sandboxes renderers by default.
  if (platform !== "win32") application.enableSandbox();
}
