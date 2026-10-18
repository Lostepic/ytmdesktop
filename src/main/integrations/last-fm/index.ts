import { shell, safeStorage } from "electron";
import Conf from "conf";
import cypto from "crypto";

import playerStateStore, { PlayerState, VideoDetails, VideoState } from "../../player-state-store";
import MemoryStore from "../../memory-store";

import IIntegration from "../integration";
import { ListeningSession } from "../listening-session";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import { LastfmErrorResponse, LastfmRequestBody, LastfmSessionResponse, LastfmTokenResponse } from "./schemas";
import log from "electron-log";

export default class LastFM implements IIntegration {
  private store: Conf<StoreSchema>;
  private memoryStore: MemoryStore<MemoryStoreSchema>;

  private isEnabled = false;

  private listeningSession = new ListeningSession();
  private playSequence = 0;
  private scrobbled = false;
  private nowPlayingSent = false;
  private sessionRequest: Promise<void> | null = null;
  private lastSessionAttempt = 0;
  private lastfmDetails: StoreSchema["lastfm"] = null;
  private playerStateFunction: (state: PlayerState) => void;

  private async createToken(): Promise<string> {
    const data: LastfmRequestBody = {
      method: "auth.gettoken",
      format: "json",

      api_key: this.lastfmDetails.api_key
    };
    const api_sig = this.createApiSig(data, this.lastfmDetails.secret);

    const response = await fetch(`https://ws.audioscrobbler.com/2.0/` + `?${this.createQueryString(data, api_sig)}`);

    const json = (await response.json()) as LastfmTokenResponse;
    return json?.token;
  }

  private async authenticateUser() {
    this.lastfmDetails.token = await this.createToken();
    this.saveSettings();

    shell.openExternal(
      `https://www.last.fm/api/auth/` + `?api_key=${encodeURIComponent(this.lastfmDetails.api_key)}` + `&token=${encodeURIComponent(this.lastfmDetails.token)}`
    );
  }

  private async getSession() {
    const params: LastfmRequestBody = {
      method: "auth.getSession",
      format: "json",
      api_key: this.lastfmDetails.api_key,
      token: this.lastfmDetails.token
    };

    const api_sig = this.createApiSig(params, this.lastfmDetails.secret);

    const response = await fetch(`https://ws.audioscrobbler.com/2.0/` + `?${this.createQueryString(params, api_sig)}`);

    const json = (await response.json()) as LastfmSessionResponse;

    if (json.error) {
      await this.authenticateUser();
    } else if (json.session) {
      this.lastfmDetails.sessionKey = json.session.key;
      this.saveSettings();
    }
  }

  // ----------------------------------------------------------

  private ensureSession(): void {
    if (this.sessionRequest || Date.now() - this.lastSessionAttempt < 30_000) return;
    this.lastSessionAttempt = Date.now();
    this.sessionRequest = this.getSession()
      .catch(error => log.warn("Last.fm authentication failed", error))
      .finally(() => {
        this.sessionRequest = null;
      });
  }

  private async updatePlayerState(state: PlayerState): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    this.listeningSession.update(state);
    if (this.playSequence !== this.listeningSession.sequence) {
      this.playSequence = this.listeningSession.sequence;
      this.scrobbled = false;
      this.nowPlayingSent = false;
    }
    if (state.videoDetails && state.trackState === VideoState.Playing && !state.adPlaying) {
      if (!this.lastfmDetails || !this.lastfmDetails.sessionKey) {
        this.ensureSession();
        return;
      }
      const duration = state.videoDetails.durationSeconds;
      if (!Number.isFinite(duration) || duration <= 30 || state.videoDetails.isLive) {
        return;
      }
      if (!this.nowPlayingSent) {
        this.nowPlayingSent = true;
        void this.updateNowPlaying(state.videoDetails);
      }
      const percent = this.store.get("lastfm.scrobblePercent");
      const threshold = Math.min(duration * (Number.isFinite(percent) ? Math.max(1, Math.min(100, percent)) / 100 : 0.5), 240);
      if (!this.scrobbled && this.listeningSession.listenedSeconds >= threshold) {
        this.scrobbled = true;
        void this.scrobbleSong(state.videoDetails, this.listeningSession.startedAt);
      }
    }
  }

  private async updateNowPlaying(videoDetails: VideoDetails): Promise<void> {
    const data = {
      method: "track.updateNowPlaying"
    };

    this.sendToLastFM(videoDetails, data);
  }

  private async scrobbleSong(videoDetails: VideoDetails, scrobbleTime: number): Promise<void> {
    const data: Partial<LastfmRequestBody> = {
      method: "track.scrobble",
      timestamp: Math.floor(scrobbleTime / 1000)
    };

    this.sendToLastFM(videoDetails, data);
  }

  private async sendToLastFM(videoDetails: VideoDetails, params: Partial<LastfmRequestBody>): Promise<void> {
    const data: Partial<LastfmRequestBody> = {
      // Add specific data to the request
      ...params,

      artist: videoDetails.author,
      track: videoDetails.title,
      album: videoDetails.album,
      duration: videoDetails.durationSeconds,
      // albumArtist, trackNumber, chosenByUser

      format: "json",
      api_key: this.lastfmDetails.api_key,
      sk: this.lastfmDetails.sessionKey
    };
    data.api_sig = this.createApiSig(data, this.lastfmDetails.secret);

    const response = fetch(`https://ws.audioscrobbler.com/2.0/`, {
      method: "POST",
      body: this.createBody(data)
    });

    response.catch((error: LastfmErrorResponse) => {
      // Check Errors against https://www.last.fm/api/show/track.scrobble#errors
      switch (error.code) {
        case 9: // Invalid session key
          this.lastfmDetails.sessionKey = null;
          this.authenticateUser();
          break;

        default:
          console.error(error);
      }
    });
  }

  // ----------------------------------------------------------

  public provide(store: Conf<StoreSchema>, memoryStore: MemoryStore<MemoryStoreSchema>): void {
    this.store = store;
    this.memoryStore = memoryStore;
  }

  public enable(): void {
    if (!this.memoryStore.get("safeStorageAvailable")) {
      log.info("Refusing to enable LastFM Integration with reason: safeStorage unavailable");
      return;
    }

    if (this.isEnabled) {
      return;
    }
    this.isEnabled = true;

    this.lastfmDetails = this.getSettings();

    if (!this.lastfmDetails || !this.lastfmDetails.sessionKey) {
      this.ensureSession();
    }

    this.playerStateFunction = (state: PlayerState) => this.updatePlayerState(state);
    playerStateStore.addEventListener(this.playerStateFunction);
  }

  public disable(): void {
    if (!this.isEnabled) {
      return;
    }

    playerStateStore.removeEventListener(this.playerStateFunction);
    this.isEnabled = false;
    this.listeningSession = new ListeningSession();
    this.playSequence = 0;
    this.scrobbled = false;
    this.nowPlayingSent = false;
  }

  public getYTMScripts(): { name: string; script: string }[] {
    return [];
  }

  /**
   * Format the data to be sent to the Last.fm API as a query string
   * @param params data to send
   * @param api_sig signature to append to the data
   * @returns URL encoded query string to be used in the request
   */
  private createQueryString(params: LastfmRequestBody, api_sig: string) {
    const data = [];
    params.api_sig = api_sig;

    for (const key in params) {
      const value = params[key as keyof LastfmRequestBody];
      if (!value) {
        continue;
      }

      data.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.toString())}`);
    }
    return data.join("&");
  }

  private createBody(params: Partial<LastfmRequestBody>) {
    const data = new URLSearchParams();
    for (const key in params) {
      const value = params[key as keyof LastfmRequestBody];
      if (value === null || value === undefined) {
        continue;
      }

      data.append(key, value.toString());
    }
    return data;
  }

  /**
   * Create a Signature for the Last.fm API
   * @see {@link https://www.last.fm/api/authspec#_8-signing-calls} for details on how to create the signature
   * @param params Data to be signed
   * @param secret Secret key
   * @returns Signature for the data
   */
  private createApiSig(params: Partial<LastfmRequestBody>, secret: string) {
    const keys = Object.keys(params).sort();
    const data = [];

    for (const key of keys) {
      // Ignore format and callback parameters
      if (key === "format" || key === "callback") {
        continue;
      }

      const value = params[key as keyof LastfmRequestBody];
      if (!value) {
        continue;
      }

      data.push(`${key}${value.toString()}`);
    }

    data.push(secret);
    return md5(data.join(""));
  }

  private getSettings(): StoreSchema["lastfm"] {
    const decryptedValues = this.store.get("lastfm");

    // Grab the session key and token from the store and decrypt them
    if (decryptedValues.sessionKey) {
      try {
        decryptedValues.sessionKey = safeStorage.decryptString(Buffer.from(decryptedValues.sessionKey, "hex"));
      } catch (e) {
        decryptedValues.sessionKey = null;
        log.error(e);
      }
    }

    if (decryptedValues.token) {
      try {
        decryptedValues.token = safeStorage.decryptString(Buffer.from(decryptedValues.token, "hex"));
      } catch (e) {
        decryptedValues.token = null;
        log.error(e);
      }
    }

    return decryptedValues;
  }

  private async saveSettings(): Promise<void> {
    try {
      if (this.lastfmDetails.sessionKey) {
        this.store.set("lastfm.sessionKey", safeStorage.encryptString(this.lastfmDetails.sessionKey).toString("hex"));
      }
      if (this.lastfmDetails.token) {
        this.store.set("lastfm.token", safeStorage.encryptString(this.lastfmDetails.token).toString("hex"));
      }
    } catch {
      // Do nothing, the values are not valid and can be ignored
    }
  }
}

function md5(string: string): string {
  return cypto.createHash("md5").update(string).digest("hex");
}
