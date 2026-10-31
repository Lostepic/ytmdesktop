import playerStateStore, { PlayerState, Thumbnail, VideoDetails, VideoState } from "../../player-state-store";
import IIntegration from "../integration";
import MemoryStore from "../../memory-store";
import { MemoryStoreSchema } from "~shared/store/schema";
import DiscordClient from "./minimal-discord-client";
import log from "electron-log";
import { DiscordActivityType } from "./minimal-discord-client/types";

const DISCORD_CLIENT_ID = "1143202598460076053";

function getHighestResThumbnail(thumbnails: Thumbnail[]): string {
  if (thumbnails.length === 0) return "";

  return thumbnails.reduce(
    (accumulator, current) => (current.height * current.width <= accumulator.height * accumulator.width ? accumulator : current),
    thumbnails[0]
  ).url;
}

function getSmallImageKey(state: VideoState) {
  // Developer Note:
  // You can add "-invert" to the end of the image key to invert (Black with White Border)
  switch (state) {
    case VideoState.Playing: {
      return "play-border";
    }
    default: {
      return "pause-border";
    }
  }
}

function getSmallImageText(state: VideoState) {
  switch (state) {
    case VideoState.Playing: {
      return "Playing";
    }
    default: {
      return "Paused";
    }
  }
}

function stringLimit(str: string, limit: number, minimum: number) {
  if (str.length > limit) {
    return str.substring(0, limit - 3).trim() + "...";
  }
  if (str.length < minimum) {
    return str.padEnd(minimum, "​"); // There's a zero width space here
  }
  return str;
}

export default class DiscordPresence implements IIntegration {
  private memoryStore: MemoryStore<MemoryStoreSchema>;

  private discordClient: DiscordClient = null;
  private enabled = false;
  private ready = false;
  private showPlaybackButton = true;
  private activityCleared = true;
  private activityDebounceTimeout: NodeJS.Timeout | null = null;
  private pauseTimeout: string | number | NodeJS.Timeout = null;
  private connectionRetryTimeout: NodeJS.Timeout | null = null;
  private hasFullMetadata = false;
  private stateCallback: (event: PlayerState) => void = null;

  private videoState: VideoState | null = null;
  private videoDetails: Partial<VideoDetails> | null = null;
  private progress: number | null = null;

  private connectionRetries: number = 0;

  private UpdateActivity() {
    if (this.activityDebounceTimeout) return;
    this.activityDebounceTimeout = setTimeout(() => {
      this.activityDebounceTimeout = null;
      if (!this.enabled || !this.ready || !this.discordClient) {
        return;
      }
      if (!this.videoDetails) {
        this.clearActivity();
        return;
      }
      const { title, author, album, id, thumbnails, durationSeconds, channelId, albumId } = this.videoDetails;
      const thumbnail = getHighestResThumbnail(thumbnails ?? []);
      this.discordClient.setActivity({
        type: DiscordActivityType.Listening,
        status_display_type: 1,
        details: stringLimit(title ?? "", 128, 2),
        details_url: `https://music.youtube.com/watch?v=${id}`,
        state: stringLimit(author ?? "", 128, 2),
        state_url: `https://music.youtube.com/channel/${channelId}`,
        timestamps: {
          start: this.videoState === VideoState.Playing ? Date.now() - this.progress * 1000 : undefined,
          end: this.videoState === VideoState.Playing ? Date.now() + (durationSeconds - this.progress) * 1000 : undefined
        },
        assets: {
          large_image: thumbnail && thumbnail.length <= 256 ? thumbnail : "ytmd-logo",
          large_text: album ? stringLimit(album, 128, 2) : undefined,
          large_url: albumId ? `https://music.youtube.com/browse/${albumId}` : undefined,
          small_image: getSmallImageKey(this.videoState),
          small_text: getSmallImageText(this.videoState)
        },
        instance: false,
        buttons: this.showPlaybackButton
          ? [
              {
                label: "Play on YTMDesktop",
                url: `ytmd://play/${id}`
              }
            ]
          : []
      });
      this.activityCleared = false;
    }, 1000);
  }

  private clearActivity(): void {
    if (!this.ready || !this.discordClient || this.activityCleared) return;
    this.discordClient.clearActivity();
    this.activityCleared = true;
  }

  private playerStateChanged(state: PlayerState) {
    if (!this.ready) return;

    const { videoDetails, videoProgress, trackState, hasFullMetadata } = state;
    if (!videoDetails) {
      this.videoDetails = null;
      this.clearActivity();
      return;
    }
    const oldState = this.videoState ?? null;
    const oldId = this.videoDetails?.id ?? null;
    const oldProgress = this.progress ?? null;
    const metadataBecameReady = hasFullMetadata && !this.hasFullMetadata;
    this.hasFullMetadata = hasFullMetadata;
    this.videoState = trackState;
    this.videoDetails = videoDetails;
    this.progress = Math.floor(videoProgress);
    if (
      hasFullMetadata &&
      (metadataBecameReady ||
        oldState !== this.videoState ||
        oldId !== this.videoDetails.id ||
        Math.abs(this.progress - oldProgress) > 1 ||
        oldProgress > this.progress)
    ) {
      this.UpdateActivity();
    }

    if (state.trackState === VideoState.Playing) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    } else if (oldState !== trackState || oldId !== videoDetails.id) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = setTimeout(() => {
        this.clearActivity();
        this.pauseTimeout = null;
      }, 30 * 1000);
    }
  }

  public provide(memoryStore: MemoryStore<MemoryStoreSchema>, showPlaybackButton = true): void {
    this.memoryStore = memoryStore;
    if (this.showPlaybackButton !== showPlaybackButton) {
      this.showPlaybackButton = showPlaybackButton;
      if (this.ready && !this.activityCleared) this.UpdateActivity();
    }
  }

  private retryDiscordConnection() {
    if (!this.enabled || this.connectionRetryTimeout) return;
    this.connectionRetries = Math.min(this.connectionRetries + 1, 5);
    const delay = Math.min(5_000 * 2 ** (this.connectionRetries - 1), 60_000);
    this.memoryStore.set("discordPresenceConnectionFailed", true);
    this.connectionRetryTimeout = setTimeout(() => {
      this.connectionRetryTimeout = null;
      if (!this.enabled || !this.discordClient) return;
      this.discordClient.connect().catch(() => this.retryDiscordConnection());
    }, delay);
    this.connectionRetryTimeout.unref();
  }

  public enable(): void {
    this.enabled = true;
    if (this.discordClient) return;
    this.discordClient = new DiscordClient(DISCORD_CLIENT_ID);

    this.discordClient.on("connect", () => {
      if (!this.enabled) return;
      clearTimeout(this.connectionRetryTimeout);
      this.connectionRetryTimeout = null;
      this.ready = true;
      this.connectionRetries = 0;
      this.videoDetails = null;
      this.videoState = null;
      this.hasFullMetadata = false;
      this.activityCleared = true;
      this.memoryStore.set("discordPresenceConnectionFailed", false);
      this.playerStateChanged(playerStateStore.getState());
    });
    this.discordClient.on("close", () => {
      log.info("Discord connection closed");
      this.ready = false;
      this.retryDiscordConnection();
    });
    this.discordClient.connect().catch(() => this.retryDiscordConnection());
    this.stateCallback = event => {
      this.playerStateChanged(event);
    };

    playerStateStore.addEventListener(this.stateCallback);
  }

  public disable(): void {
    this.enabled = false;
    this.connectionRetries = 0;
    this.memoryStore.set("discordPresenceConnectionFailed", false);

    clearTimeout(this.activityDebounceTimeout);
    clearTimeout(this.pauseTimeout);
    clearTimeout(this.connectionRetryTimeout);
    this.activityDebounceTimeout = this.pauseTimeout = this.connectionRetryTimeout = null;

    if (this.stateCallback) {
      playerStateStore.removeEventListener(this.stateCallback);
    }

    if (!this.discordClient) return;
    this.ready = false;
    this.discordClient.destroy();
    this.discordClient = null;
  }

  public getYTMScripts(): { name: string; script: string }[] {
    return [];
  }
}
