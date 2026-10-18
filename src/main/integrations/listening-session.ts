import { PlayerState, VideoState } from "../player-state-store";

/** Tracks one play using observed playback, rather than a timer or seek position. */
export class ListeningSession {
  public sequence = 0;
  public listenedSeconds = 0;
  public startedAt = 0;
  private videoIds = new Set<string>();
  private lastProgress = 0;
  private lastUpdate = 0;
  private wasPlaying = false;

  public update(state: PlayerState, now = Date.now()): void {
    const details = state.videoDetails;
    const progress = Number.isFinite(state.videoProgress) ? Math.max(0, state.videoProgress) : 0;
    const playing = state.trackState === VideoState.Playing && !state.adPlaying;
    if (!details?.id || state.adPlaying) {
      this.wasPlaying = false;
      this.lastUpdate = now;
      return;
    }

    const restarted =
      details.durationSeconds > 0 &&
      this.lastProgress >= details.durationSeconds - 3 &&
      progress <= 3 &&
      this.lastProgress - progress > details.durationSeconds / 2;
    const newPlay = !this.videoIds.has(details.id) || restarted;
    if (newPlay) {
      this.sequence++;
      this.listenedSeconds = 0;
      this.startedAt = playing ? now : 0;
      this.videoIds = new Set([details.id]);
      const item = state.queue?.items?.[state.queue.selectedItemIndex];
      const ids = [item?.videoId, ...(item?.counterparts?.map(counterpart => counterpart.videoId) ?? [])];
      if (ids.includes(details.id)) ids.filter(Boolean).forEach(id => this.videoIds.add(id));
    } else {
      const elapsed = Math.max(0, (now - this.lastUpdate) / 1000);
      const delta = progress - this.lastProgress;
      // Exclude seeks, buffering, ads and long gaps caused by sleep or suspension.
      if (this.wasPlaying && !state.adPlaying && delta >= 0 && delta <= elapsed + 2) {
        this.listenedSeconds += Math.min(delta, elapsed, 10);
      }
    }
    if (!this.startedAt && playing) this.startedAt = now;
    // Metadata, volume and queue events can repeat the same progress sample.
    // Preserve the clock until playback advances or changes state.
    if (newPlay || progress !== this.lastProgress || playing !== this.wasPlaying) this.lastUpdate = now;
    this.lastProgress = progress;
    this.wasPlaying = playing;
  }
}
