# Changelog

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
