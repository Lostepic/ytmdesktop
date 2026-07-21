/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.png";
