# Changelog

## 3.0.9 — Stream Deck authorization compatibility

- Allow the official Stream Deck connector's action and property inspector to retry pairing without being blocked by a shared HTTP rate limit.
- Retain the explicit five-minute pairing gate, one-time authorization codes, user approval prompt, expiry, and concurrent-window cap.
- Verify the official connector can authorize and establish its live Socket.IO connection end to end.

## 3.0.8 — Settings controls and project showcase

- Keep open dropdown menus above adjacent switches and sliders, with aligned fixed-width control columns.
- Add an organized screenshot gallery covering the player, now-playing view, integrations, playback, shortcuts, and companion management.

## 3.0.7 — Companion credential stability

- Merge batched settings against current main-process state so stale settings windows cannot overwrite companion credentials.
- Refresh active companion sessions only when authorization tokens actually change.
- Restrict the local companion API listener to `127.0.0.1`.

## 3.0.6 — Settings bridge correction

- Expose batched settings persistence through Electron’s isolated preload bridge so interface scale and every other setting can be changed without crashing the Settings view.

## 3.0.5 — Popup positioning correction

- Remove globally reparented YouTube tooltips whose stale coordinates could leave the “Start playback” hint over the navigation rail.

## 3.0.4 — Runtime and interface optimization

- Batch settings changes into one validated IPC operation and persistent-store update.
- Avoid repeated secure-token refreshes caused by unrelated settings changes.
- Cache Windows taskbar artwork and update controls only when playback state changes.
- Skip unchanged memory-store notifications and unnecessary companion serialization.
- Reduce now-playing export writes while preserving one-second JSON updates.
- Correct compact-width chip clipping, player control spacing, and misplaced tooltips.

## 3.0.3 — Deterministic update checks

- Resolve the exact latest tag from the fork's GitHub Releases API before giving Squirrel its version-specific feed.
- Validate release tags and apply timeouts before update metadata is accepted.

## 3.0.2 — Update reliability

- Switched Windows updates to the fork's direct latest-release feed, avoiding stale proxy caches.

## 3.0.1 — Repository and release polish

- Replaced the inherited README with accurate feature, package, privacy, updater, and development documentation.
- Added live release, build, download, Electron, and license status badges.
- Fixed update and publisher ownership permanently to `Lostepic/ytmdesktop`.
- Removed the stale upstream contributor generator, outdated screenshot, and unnecessary third-party auto-merge workflow.
- Removed editor-specific configuration, a redundant font, and a duplicate Windows tray icon.
- Reworked bug and feature request forms.
- Documented why each remaining platform-specific icon and build file is required.

## 3.0.0 — Initial maintained release

- Rebuilt the desktop shell around current Electron and Vue tooling.
- Modernized the player, title bar, loading states, settings, and navigation.
- Added Midnight, OLED, Ocean, and Violet themes.
- Added compact always-on-top mini-player mode and settings search.
- Improved playback stability, background scheduling, session restoration, and source-quality guidance.
- Added SponsorBlock controls and ListenBrainz scrobbling.
- Added local now-playing JSON/text exports for OBS and Stream Deck.
- Added a permission-gated declarative plugin manager.
- Added optional, completely local performance telemetry.
- Expanded companion API and global shortcut support.
- Replaced deprecated Electron APIs and tightened IPC, navigation, storage, and authorization handling.
- Added automated quality checks and Windows, macOS, and Linux release builds.
