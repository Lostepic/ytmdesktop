import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

// There is probably a better way to do this, such as fetching it directly from forge
let makerArch = null;
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--arch") {
    makerArch = process.argv[i + 1];
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    executableName: "youtube-music-desktop-app",
    icon: "./src/assets/icons/ytmd",
    extraResource: [
      "./src/assets/icons/ytmd.ico",
      "./src/assets/icons/trayTemplate.png",
      "./src/assets/icons/trayTemplate@2x.png",
      "./src/assets/icons/ytmd.png",
      "./src/assets/icons/ytmd_white.png",
      "./src/assets/icons/ytmd_black.png",

      "./src/assets/icons/controls/pause-button.png",
      "./src/assets/icons/controls/play-button.png",
      "./src/assets/icons/controls/play-next-button.png",
      "./src/assets/icons/controls/play-previous-button.png"
    ],
    protocols: [
      {
        name: "YTM Desktop",
        schemes: ["ytmd"]
      }
    ],
    appCategoryType: "public.app-category.music",
    asar: true
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      iconUrl: "https://raw.githubusercontent.com/Lostepic/ytmdesktop/development/src/assets/icons/ytmd.ico"
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        categories: ["AudioVideo", "Audio"],
        mimeType: ["x-scheme-handler/ytmd"],
        icon: "./src/assets/icons/ytmd.png"
      }
    }),
    new MakerDeb({
      options: {
        categories: ["AudioVideo", "Audio"],
        mimeType: ["x-scheme-handler/ytmd"],
        section: "sound",
        icon: "./src/assets/icons/ytmd.png"
      }
    })
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "Lostepic",
          name: "ytmdesktop"
        }
      }
    }
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "config/vite/main.ts",
          target: "main"
        },
        // TODO: Utilize a single config for preload so we can share chunks if needed
        {
          entry: "src/renderer/windows/main/preload.ts",
          config: "config/vite/preload/main_window.ts",
          target: "preload"
        },
        {
          entry: "src/renderer/windows/settings/preload.ts",
          config: "config/vite/preload/settings_window.ts",
          target: "preload"
        },
        {
          entry: "src/renderer/windows/authorize-companion/preload.ts",
          config: "config/vite/preload/authorize_companion_window.ts",
          target: "preload"
        },
        {
          entry: "src/renderer/ytmview/preload.ts",
          config: "config/vite/preload/ytmview.ts",
          target: "preload"
        }
      ],
      renderer: [
        // Instead of opting for defining each window as a separate object we bundle them all together and have a more custom output to share chunks
        {
          name: "all_windows",
          config: "config/vite/renderer.ts"
        }
      ]
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: process.platform === "darwin" && makerArch == "arm64",
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};

export default config;
