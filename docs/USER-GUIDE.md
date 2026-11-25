# YTM Desktop user guide

## Downloads and updates

Get the app from [GitHub Releases](https://github.com/Lostepic/ytmdesktop/releases/latest). Downloads are release assets, not GitHub Packages.

- **Windows:** Run the x64 Setup executable. The installer is unsigned, so Windows may show an unknown-publisher warning. Installed copies update from this repository. The `RELEASES` and `.nupkg` files are for the Windows updater, not manual installation.
- **macOS:** Choose `arm64` for Apple Silicon or `x64` for an Intel Mac. Extract the ZIP and move the app to Applications. The archives are ad-hoc signed, not Apple-notarized.
- **Linux:** Install the `.deb` or `.rpm` with your package manager. Download newer packages from GitHub Releases.

## Echo Show 5 and small displays

With spacedesk already connected on Windows, turn on **Small Display mode** using the tablet button or **Settings → Appearance**. Use the monitor button in Now Playing to choose the Echo Show display. YTM Desktop runs on your computer; this is not a separate Echo Show app.

- **Browse:** Search at the top; Home, Explore, Library, Now Playing, and Play/Pause are on the bottom bar. Swipe sideways across album rows or scroll down through the page.
- **Up Next:** Opens at the current track. Tap a row to play it, or use swipes or the page controls to scroll.
- **Now Playing:** The artwork sits above the transport controls on tall displays and beside them on wide ones.

## Audio and integrations

Choose your source streaming quality in YouTube Music. The optional ten-band EQ under **Settings → Playback** changes tone, not bitrate or source detail.

Enable the local companion server under **Settings → Integrations** to use a compatible Stream Deck connector. Enable pairing, select **Authorize** in the connector, and approve its request in the app. The pairing window expires automatically. The default local endpoint is `127.0.0.1:9863`.

Now-playing export supplies local text and JSON files for OBS or other tools. SponsorBlock, Discord Rich Presence, and scrobbling are optional integrations. Performance telemetry is off by default and stays local when enabled.

## Screenshots

[Now Playing](../screenshots/now-playing.png) · [Integrations](../screenshots/settings-integrations.png) · [Playback](../screenshots/settings-playback.png) · [Shortcuts](../screenshots/settings-shortcuts.png) · [General settings](../screenshots/settings-general.png) · [Companions](../screenshots/settings-authorized-companions.png)
