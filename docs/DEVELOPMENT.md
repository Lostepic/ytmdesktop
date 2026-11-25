# Development

Use Node.js 24.22 or newer and Corepack. The repository pins Yarn in `package.json`.

```sh
corepack enable
yarn install --immutable
yarn start
```

Run `yarn check` for TypeScript, lint, and formatting; `yarn test:unit` for app and integration logic; and `yarn test:ui` for Electron renderer tests. On headless Linux, run Electron tests with `xvfb-run --auto-servernum`.

Run `yarn package` to build the unpacked app and `yarn test:built` to verify compiled assets and sandboxed renderers. On Windows, `yarn test:windows-startup` checks the actual packaged executable with a temporary profile; it does not touch the installed profile.

`yarn make --arch x64` builds installers for the current platform under `out/make`. Version tags run the cross-platform [release workflow](../.github/workflows/publish.yml), which uses the matching [changelog](CHANGELOG.md) entry as release notes.

The Electron main process lives in `src/main`, Vue windows and preloads in `src/renderer`, shared types in `src/shared`, and build configuration in `config/vite`.
