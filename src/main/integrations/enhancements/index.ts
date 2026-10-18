import { app, safeStorage, WebContentsView } from "electron";
import Conf from "conf";
import fs from "fs/promises";
import path from "path";
import log from "electron-log";
import playerStateStore, { PlayerState, VideoState } from "../../player-state-store";
import { StoreSchema } from "~shared/store/schema";
import { ListeningSession } from "../listening-session";

type SponsorSegment = { segment: [number, number]; UUID: string; category: string; actionType: string };

export default class Enhancements {
  private store: Conf<StoreSchema>;
  private view: () => WebContentsView | null;
  private integrationSettings: StoreSchema["integrations"];
  private currentVideoId = "";
  private segments: SponsorSegment[] = [];
  private skipped = new Set<string>();
  private lastExport = 0;
  private lastExportText = "";
  private lastTelemetryWrite = 0;
  private lastProgress = 0;
  private listeningSession = new ListeningSession();
  private listenSequence = 0;
  private listenSubmitted = false;
  private playingNowSent = false;
  private sponsorRequest: AbortController | null = null;
  private telemetry = { launches: 1, tracksPlayed: 0, bufferingEvents: 0, playbackSeconds: 0, lastUpdated: "" };
  private previousState: PlayerState | null = null;

  public provide(store: Conf<StoreSchema>, view: () => WebContentsView | null): void {
    this.store = store;
    this.view = view;
    this.integrationSettings = store.get("integrations");
    store.onDidChange("integrations", value => {
      if (!value) return;
      const sponsorChanged =
        value.sponsorBlockEnabled !== this.integrationSettings.sponsorBlockEnabled ||
        value.sponsorBlockSkipIntros !== this.integrationSettings.sponsorBlockSkipIntros ||
        value.sponsorBlockSkipOutros !== this.integrationSettings.sponsorBlockSkipOutros;
      if (value.listenBrainzEnabled !== this.integrationSettings.listenBrainzEnabled) {
        this.listeningSession = new ListeningSession();
        this.listenSequence = 0;
        this.listenSubmitted = false;
        this.playingNowSent = false;
      }
      if (sponsorChanged) {
        this.sponsorRequest?.abort();
        this.segments = [];
        this.skipped.clear();
      }
      this.integrationSettings = value;
      if (sponsorChanged && value.sponsorBlockEnabled && this.currentVideoId) void this.loadSponsorSegments(this.currentVideoId);
    });
    playerStateStore.addEventListener(state => void this.onState(state));
    void this.validatePluginManifests();
  }

  private async onState(state: PlayerState): Promise<void> {
    const settings = this.integrationSettings;
    const videoId = state.videoDetails?.id ?? "";
    this.listeningSession.update(state);
    if (this.listenSequence !== this.listeningSession.sequence) {
      this.listenSequence = this.listeningSession.sequence;
      this.listenSubmitted = false;
      this.playingNowSent = false;
    }

    if (videoId && videoId !== this.currentVideoId) {
      this.currentVideoId = videoId;
      this.sponsorRequest?.abort();
      this.segments = [];
      this.skipped.clear();
      this.lastProgress = 0;
      this.telemetry.tracksPlayed++;
      if (settings.sponsorBlockEnabled) void this.loadSponsorSegments(videoId);
    }

    if (settings.sponsorBlockEnabled && state.trackState === VideoState.Playing) this.skipMarkedSegment(state.videoProgress);
    if (settings.nowPlayingExportEnabled && Date.now() - this.lastExport >= 1_000) void this.exportNowPlaying(state);

    const duration = state.videoDetails?.durationSeconds ?? 0;
    if (settings.listenBrainzEnabled && videoId && state.trackState === VideoState.Playing && !state.adPlaying) {
      if (!this.playingNowSent) {
        this.playingNowSent = true;
        void this.submitListen(state, "playing_now");
      }
      const threshold = Math.min(duration / 2, 240);
      if (
        Number.isFinite(duration) &&
        duration > 30 &&
        !state.videoDetails.isLive &&
        !this.listenSubmitted &&
        this.listeningSession.listenedSeconds >= threshold
      ) {
        this.listenSubmitted = true;
        void this.submitListen(state, "single");
      }
    }

    if (settings.localTelemetryEnabled) {
      if (state.trackState === VideoState.Buffering && this.previousState?.trackState !== VideoState.Buffering) this.telemetry.bufferingEvents++;
      const progressDelta = state.videoProgress - this.lastProgress;
      if (state.trackState === VideoState.Playing && progressDelta > 0 && progressDelta < 5) this.telemetry.playbackSeconds += progressDelta;
      if (Date.now() - this.lastTelemetryWrite >= 30_000) {
        this.lastTelemetryWrite = Date.now();
        void this.writeTelemetry();
      }
    }
    this.lastProgress = state.videoProgress;
    this.previousState = state;
  }

  private async loadSponsorSegments(videoId: string): Promise<void> {
    const controller = new AbortController();
    this.sponsorRequest = controller;
    const settings = this.integrationSettings;
    const categories = ["sponsor"];
    if (settings.sponsorBlockSkipIntros) categories.push("intro");
    if (settings.sponsorBlockSkipOutros) categories.push("outro");
    const query = encodeURIComponent(JSON.stringify(categories));
    try {
      const response = await fetch(
        `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${query}&actionTypes=[%22skip%22]`,
        {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
          headers: { "User-Agent": `YTM-Desktop/${app.getVersion()}` }
        }
      );
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Invalid SponsorBlock segment response");
      const segments = payload.filter(
        (item): item is SponsorSegment =>
          item &&
          typeof item.UUID === "string" &&
          item.actionType === "skip" &&
          Array.isArray(item.segment) &&
          item.segment.length === 2 &&
          item.segment.every(Number.isFinite) &&
          item.segment[0] >= 0 &&
          item.segment[1] > item.segment[0]
      );
      if (!controller.signal.aborted && this.currentVideoId === videoId && this.integrationSettings.sponsorBlockEnabled) this.segments = segments;
    } catch (error) {
      if (!controller.signal.aborted) log.warn("SponsorBlock lookup failed", error instanceof Error ? error.message : error);
    }
  }

  private skipMarkedSegment(progress: number): void {
    const match = this.segments.find(
      item => item.actionType === "skip" && progress >= item.segment[0] && progress < item.segment[1] && !this.skipped.has(item.UUID)
    );
    if (!match) return;
    this.skipped.add(match.UUID);
    this.view()?.webContents.send("remoteControl:execute", "seekTo", match.segment[1] + 0.05);
  }

  private async exportNowPlaying(state: PlayerState): Promise<void> {
    this.lastExport = Date.now();
    const directory = path.join(app.getPath("documents"), "YTM Desktop");
    const details = state.videoDetails;
    const payload = {
      title: details?.title ?? "",
      artist: details?.author ?? "",
      album: details?.album ?? "",
      videoId: details?.id ?? "",
      artwork: details?.thumbnails?.at(-1)?.url ?? "",
      duration: details?.durationSeconds ?? 0,
      progress: state.videoProgress,
      playing: state.trackState === VideoState.Playing,
      updatedAt: new Date().toISOString()
    };
    const text = payload.title ? `${payload.artist} — ${payload.title}` : "";
    try {
      await fs.mkdir(directory, { recursive: true });
      const writes: Array<Promise<void>> = [fs.writeFile(path.join(directory, "now-playing.json"), JSON.stringify(payload, null, 2), "utf8")];
      if (text !== this.lastExportText) {
        this.lastExportText = text;
        writes.push(fs.writeFile(path.join(directory, "now-playing.txt"), text, "utf8"));
      }
      await Promise.all(writes);
    } catch (error) {
      log.warn("Now-playing export failed", error);
    }
  }

  private getListenBrainzToken(): string | null {
    const encrypted = this.store.get("integrations.listenBrainzToken");
    if (typeof encrypted !== "string" || !encrypted || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "hex"));
    } catch {
      return null;
    }
  }

  private async submitListen(state: PlayerState, listenType: "playing_now" | "single"): Promise<void> {
    const token = this.getListenBrainzToken();
    const details = state.videoDetails;
    if (!token || !details?.title || !details.author) return;
    const listen = {
      track_metadata: {
        artist_name: details.author,
        track_name: details.title,
        release_name: details.album || undefined,
        additional_info: { origin_url: `https://music.youtube.com/watch?v=${details.id}`, media_player: "YTM Desktop" }
      },
      ...(listenType === "single" ? { listened_at: Math.floor(this.listeningSession.startedAt / 1000) } : {})
    };
    try {
      const response = await fetch("https://api.listenbrainz.org/1/submit-listens", {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ listen_type: listenType, payload: [listen] })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      log.warn("ListenBrainz submission failed", error instanceof Error ? error.message : error);
    }
  }

  private async writeTelemetry(): Promise<void> {
    this.telemetry.lastUpdated = new Date().toISOString();
    try {
      await fs.writeFile(path.join(app.getPath("userData"), "local-performance.json"), JSON.stringify(this.telemetry, null, 2), "utf8");
    } catch (error) {
      log.warn("Local telemetry write failed", error);
    }
  }

  private async validatePluginManifests(): Promise<void> {
    if (!this.store.get("integrations.pluginManagerEnabled")) return;
    const directory = path.join(app.getPath("userData"), "plugins");
    const allowedPermissions = new Set(["player.read", "player.control", "nowPlaying.read", "network.sponsorblock", "network.listenbrainz"]);
    try {
      await fs.mkdir(directory, { recursive: true });
      const files = (await fs.readdir(directory)).filter(file => file.endsWith(".json"));
      for (const file of files) {
        const manifest = JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as { id?: string; name?: string; permissions?: string[] };
        if (
          !manifest.id ||
          !manifest.name ||
          !Array.isArray(manifest.permissions) ||
          manifest.permissions.some(permission => !allowedPermissions.has(permission))
        ) {
          log.warn(`Plugin manifest rejected: ${file}`);
          continue;
        }
        log.info(`Plugin discovered (awaiting explicit permission grant): ${manifest.name} [${manifest.permissions.join(", ")}]`);
      }
    } catch (error) {
      log.warn("Plugin manifest scan failed", error);
    }
  }
}
