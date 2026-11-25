<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SmallDisplayPlayer, SmallDisplayCommand } from "~shared/small-display";

const props = defineProps<{ player: SmallDisplayPlayer; theme: number; fullscreen: boolean }>();
const emit = defineEmits<{
  command: [command: SmallDisplayCommand, value?: number | string];
  browse: [];
  queue: [];
  desktop: [];
  fullscreen: [];
  screen: [];
}>();
const failedArtwork = ref("");
const seekDraft = ref<number | null>(null);
const volumeDraft = ref<number | null>(null);
const time = (value: number) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const seekable = computed(() => props.player.ready && props.player.duration > 0 && !props.player.live && !props.player.adPlaying);
const progress = computed(() => seekDraft.value ?? props.player.progress);
const volume = computed(() => volumeDraft.value ?? props.player.volume);
const repeatLabel = computed(() => ["Repeat off", "Repeat all", "Repeat one"][props.player.repeatMode] ?? "Repeat off");
watch(
  () => props.player.title,
  () => {
    seekDraft.value = null;
  }
);
function seek() {
  if (seekable.value && seekDraft.value !== null) emit("command", "seekTo", seekDraft.value);
  seekDraft.value = null;
}
function changeVolume() {
  if (volumeDraft.value !== null) emit("command", "setVolume", volumeDraft.value);
  volumeDraft.value = null;
}
</script>

<template>
  <main class="small-player" :data-theme="theme" aria-label="Small display music player">
    <header class="display-header">
      <span class="display-label">YTM <span> / SMALL DISPLAY</span></span>
      <nav aria-label="Display mode">
        <button aria-label="Choose display" title="Choose display" @click="emit('screen')">
          <span class="material-symbols-outlined" aria-hidden="true">monitor</span>
        </button>
        <button class="browse" aria-label="Browse music" @click="emit('browse')">
          <span class="material-symbols-outlined" aria-hidden="true">library_music</span><span>Browse music</span>
        </button>
        <button aria-label="Up Next" title="Up Next" @click="emit('queue')">
          <span class="material-symbols-outlined" aria-hidden="true">queue_music</span><span class="queue-label">Up Next</span>
        </button>
        <button
          :aria-label="fullscreen ? 'Leave fullscreen' : 'Enter fullscreen'"
          :title="fullscreen ? 'Leave fullscreen' : 'Enter fullscreen'"
          @click="emit('fullscreen')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ fullscreen ? "fullscreen_exit" : "fullscreen" }}</span>
        </button>
        <button aria-label="Return to desktop layout" title="Return to desktop layout" @click="emit('desktop')">
          <span class="material-symbols-outlined" aria-hidden="true">desktop_windows</span>
        </button>
      </nav>
    </header>

    <section class="now-playing" aria-label="Now playing">
      <div class="artwork">
        <img
          v-if="player.artwork && failedArtwork !== player.artwork"
          :src="player.artwork"
          alt=""
          referrerpolicy="no-referrer"
          draggable="false"
          @error="failedArtwork = player.artwork"
        />
        <span v-else class="material-symbols-outlined artwork-placeholder" aria-hidden="true">music_note</span>
      </div>
      <div class="track-panel">
        <span class="playback-status">{{
          player.adPlaying
            ? "ADVERTISEMENT"
            : player.buffering
              ? "BUFFERING"
              : player.live
                ? "LIVE"
                : player.playing
                  ? "NOW PLAYING"
                  : player.ready
                    ? "PAUSED"
                    : "YOUR MUSIC, WITH ROOM TO BREATHE"
        }}</span>
        <h1 :title="player.title">{{ player.title }}</h1>
        <p class="artist" :title="player.artist">{{ player.artist }}</p>
        <p v-if="player.album" class="album" :title="player.album">{{ player.album }}</p>
        <div class="transport" aria-label="Playback controls">
          <button aria-label="Previous track" :disabled="!player.ready || player.adPlaying" @click="emit('command', 'previous')">
            <span class="material-symbols-outlined" aria-hidden="true">skip_previous</span>
          </button>
          <button class="play" :aria-label="player.playing ? 'Pause' : 'Play'" :disabled="!player.ready" @click="emit('command', 'playPause')">
            <span class="material-symbols-outlined" aria-hidden="true">{{ player.playing ? "pause" : "play_arrow" }}</span>
          </button>
          <button aria-label="Next track" :disabled="!player.ready || player.adPlaying" @click="emit('command', 'next')">
            <span class="material-symbols-outlined" aria-hidden="true">skip_next</span>
          </button>
          <button
            class="like"
            aria-label="Like track"
            :aria-pressed="player.liked"
            :disabled="!player.ready || player.adPlaying"
            @click="emit('command', 'toggleLike')"
          >
            <span class="material-symbols-outlined" aria-hidden="true">favorite</span>
          </button>
        </div>
      </div>
    </section>

    <div class="seek-row">
      <span>{{ player.live ? "LIVE" : time(progress) }}</span>
      <input
        :value="progress"
        type="range"
        min="0"
        :max="player.duration || 1"
        step="1"
        aria-label="Playback position"
        :disabled="!seekable"
        @input="seekDraft = Number(($event.target as HTMLInputElement).value)"
        @change="seek"
        @pointercancel="seekDraft = null"
        @blur="seekDraft = null"
      />
      <span>{{ player.live ? "LIVE" : time(player.duration) }}</span>
    </div>
    <footer class="utility-row">
      <button aria-label="Shuffle queue" :disabled="!player.ready" @click="emit('command', 'shuffle')">
        <span class="material-symbols-outlined" aria-hidden="true">shuffle</span>
      </button>
      <button
        :aria-label="repeatLabel"
        :aria-pressed="player.repeatMode > 0"
        :disabled="!player.ready"
        @click="emit('command', 'repeatMode', ['ALL', 'ONE', 'NONE'][player.repeatMode] ?? 'NONE')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{ player.repeatMode === 2 ? "repeat_one" : "repeat" }}</span>
      </button>
      <div class="volume-control">
        <button :aria-label="player.muted ? 'Unmute' : 'Mute'" @click="emit('command', player.muted ? 'unmute' : 'mute')">
          <span class="material-symbols-outlined" aria-hidden="true">{{ player.muted || volume === 0 ? "volume_off" : "volume_up" }}</span>
        </button>
        <input
          :value="volume"
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="Volume"
          @input="volumeDraft = Number(($event.target as HTMLInputElement).value)"
          @change="changeVolume"
          @pointercancel="volumeDraft = null"
          @blur="volumeDraft = null"
        />
        <output>{{ player.muted ? "Muted" : Math.round(volume) + "%" }}</output>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.queue-label {
  display: none;
  font-size: 13px;
}
@media (min-width: 720px) {
  .queue-label {
    display: inline;
  }
}
.small-player {
  --accent: #ff6477;
  --accent-ink: #24080e;
  --wash: #241522;
  height: 100%;
  min-height: 0;
  padding: 12px 24px 14px;
  display: grid;
  grid-template-rows: 44px minmax(130px, 1fr) 44px 44px;
  gap: 10px;
  overflow: auto;
  background: radial-gradient(ellipse at 12% 60%, var(--wash), transparent 65%), #0d0e14;
  color: #faf8fc;
  user-select: none;
}
.small-player[data-theme="1"] {
  --wash: #000;
  background: #000;
}
.small-player[data-theme="2"] {
  --accent: #83d5ff;
  --accent-ink: #07243b;
  --wash: #122c42;
}
.small-player[data-theme="3"] {
  --accent: #c5a2ff;
  --accent-ink: #23133e;
  --wash: #2a1c3d;
}
button {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid #ffffff15;
  border-radius: 14px;
  background: #ffffff07;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  touch-action: manipulation;
  cursor: pointer;
}
button:active:not(:disabled) {
  background: #ffffff24;
}
button:disabled {
  opacity: 0.35;
  cursor: default;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
button[aria-pressed="true"] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.display-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.display-label {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.display-label span {
  font-size: 10px;
  color: #a6a0b2;
  letter-spacing: 0.12em;
}
nav {
  display: flex;
  gap: 8px;
}
.browse {
  font-size: 13px;
}
.now-playing {
  display: grid;
  grid-template-columns: minmax(90px, 0.65fr) minmax(0, 1.35fr);
  gap: 28px;
  min-height: 0;
  align-items: center;
}
.artwork {
  height: 100%;
  max-height: 300px;
  max-width: 100%;
  aspect-ratio: 1;
  align-self: center;
  justify-self: center;
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(140deg, #ffffff12, #ffffff03);
  border: 1px solid #ffffff13;
}
.artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.artwork-placeholder {
  font-size: 64px;
  color: var(--accent);
}
.track-panel {
  min-width: 0;
}
.playback-status {
  color: var(--accent);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.15em;
}
h1 {
  margin: 7px 0;
  font-size: clamp(20px, 3.9vw, 36px);
  line-height: 1.12;
  font-weight: 650;
  letter-spacing: -0.035em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.artist,
.album {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  margin: 5px 0;
}
.artist {
  color: #d6d0df;
  font-size: clamp(14px, 2.1vw, 19px);
}
.album {
  color: #918b9b;
  font-size: 12px;
}
.transport {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
}
.transport button {
  width: 56px;
  height: 56px;
  padding: 0;
  border-radius: 50%;
}
.transport .material-symbols-outlined {
  font-size: 32px;
}
.transport .play {
  width: 72px;
  height: 72px;
  color: var(--accent-ink);
  background: var(--accent);
  border: 0;
}
.transport .play .material-symbols-outlined {
  font-size: 42px;
  font-variation-settings: "FILL" 1;
}
.transport .like {
  margin-left: 8px;
  width: 48px;
  height: 48px;
}
.like[aria-pressed="true"] .material-symbols-outlined {
  font-variation-settings: "FILL" 1;
}
.seek-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 46px;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #b0aabb;
}
.seek-row span:last-child {
  text-align: right;
}
input[type="range"] {
  margin: 0;
  width: 100%;
  height: 44px;
  min-width: 0;
  accent-color: var(--accent);
  cursor: pointer;
  touch-action: pan-y;
}
.utility-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.volume-control {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(56%, 360px);
}
.volume-control output {
  width: 44px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  color: #b0aabb;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 600px) {
  .small-player {
    padding: 8px 12px;
    gap: 6px;
  }
  .display-label span,
  .browse > span:last-child {
    display: none;
  }
  .now-playing {
    grid-template-columns: minmax(76px, 0.6fr) minmax(0, 1.4fr);
    gap: 16px;
  }
  .transport {
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .transport button,
  .transport .play,
  .transport .like {
    width: 44px;
    height: 44px;
    min-width: 44px;
    margin: 0;
  }
  .transport .material-symbols-outlined,
  .transport .play .material-symbols-outlined {
    font-size: 28px;
  }
  .volume-control {
    width: calc(100% - 108px);
    gap: 6px;
  }
  .volume-control output {
    width: 36px;
  }
  .utility-row {
    gap: 6px;
  }
  .album {
    display: none;
  }
  nav {
    gap: 4px;
  }
}
@media (max-height: 400px) {
  .small-player {
    padding-top: 6px;
    padding-bottom: 6px;
    gap: 4px;
  }
  h1 {
    font-size: clamp(18px, 3.2vw, 26px);
    margin: 4px 0;
  }
  .album,
  .playback-status {
    display: none;
  }
  .transport {
    margin-top: 8px;
  }
  .transport button,
  .transport .play {
    height: 48px;
    width: 48px;
  }
  .transport .play {
    height: 64px;
    width: 64px;
  }
  .transport .play .material-symbols-outlined {
    font-size: 32px;
  }
}
@media (max-width: 600px) and (max-height: 400px) {
  .transport button,
  .transport .play,
  .transport .like {
    height: 44px;
    width: 44px;
  }
}
@media (max-width: 600px) and (min-height: 480px) and (orientation: portrait) {
  .small-player {
    grid-template-rows: 44px minmax(250px, 1fr) 44px 44px;
    padding: 12px 16px 16px;
    gap: 8px;
    background: radial-gradient(ellipse at 50% 28%, var(--wash), transparent 72%), #0d0e14;
  }
  .now-playing {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
  }
  .artwork {
    min-height: 0;
    max-height: 330px;
    max-width: min(100%, 330px);
  }
  .track-panel {
    text-align: center;
  }
  h1 {
    font-size: clamp(22px, 6vw, 32px);
  }
  .transport {
    justify-content: center;
    gap: 12px;
    flex-wrap: nowrap;
  }
  .transport .play {
    width: 64px;
    height: 64px;
  }
  .transport .play .material-symbols-outlined {
    font-size: 36px;
  }
}
</style>
