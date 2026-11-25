<script setup lang="ts">
import { computed, ref } from "vue";
import {
  SMALL_DISPLAY_QUERY_LIMIT,
  SMALL_DISPLAY_SEARCH_HEIGHT,
  SMALL_DISPLAY_TABS_HEIGHT,
  type SmallDisplayBrowsePage,
  type SmallDisplayPlayer
} from "~shared/small-display";

const props = defineProps<{ player: SmallDisplayPlayer; fullscreen: boolean; theme: number }>();
const emit = defineEmits<{
  back: [];
  search: [query: string];
  page: [page: SmallDisplayBrowsePage];
  player: [];
  toggle: [];
  fullscreen: [];
}>();
const query = defineModel<string>("query", { required: true });
const field = ref<HTMLInputElement | null>(null);
const currentTitle = computed(() => (props.player.ready ? props.player.title : "Now playing"));
const tabs: { label: string; icon: string; page: SmallDisplayBrowsePage }[] = [
  { label: "Home", icon: "home", page: "home" },
  { label: "Explore", icon: "explore", page: "explore" },
  { label: "Library", icon: "library_music", page: "library" }
];
function submitSearch() {
  const term = query.value.trim();
  if (!term || term.length > SMALL_DISPLAY_QUERY_LIMIT) return;
  emit("search", term);
  field.value?.blur();
}
</script>

<template>
  <div class="browse-shell" :data-theme="theme">
    <header class="search-bar" :style="{ height: SMALL_DISPLAY_SEARCH_HEIGHT + 'px' }">
      <button type="button" class="utility" aria-label="Back in Browse" @click="emit('back')">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      </button>
      <form role="search" @submit.prevent="submitSearch">
        <input
          ref="field"
          v-model="query"
          type="search"
          :maxlength="SMALL_DISPLAY_QUERY_LIMIT"
          placeholder="Songs, albums, artists…"
          aria-label="Search music"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
        />
        <button class="search-submit" type="submit" aria-label="Submit search" :disabled="!query.trim()">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
        </button>
      </form>
      <button class="utility" :aria-label="fullscreen ? 'Leave fullscreen' : 'Enter fullscreen'" @click="emit('fullscreen')">
        <span class="material-symbols-outlined" aria-hidden="true">{{ fullscreen ? "fullscreen_exit" : "fullscreen" }}</span>
      </button>
    </header>
    <nav class="browse-toolbar" aria-label="Small display navigation" :style="{ height: SMALL_DISPLAY_TABS_HEIGHT + 'px' }">
      <button v-for="tab in tabs" :key="tab.page" :aria-label="tab.label" @click="emit('page', tab.page)">
        <span class="material-symbols-outlined" aria-hidden="true">{{ tab.icon }}</span><span>{{ tab.label }}</span>
      </button>
      <button class="now-tab" aria-label="Now playing" :title="currentTitle" @click="emit('player')">
        <span class="material-symbols-outlined" aria-hidden="true">graphic_eq</span><span>Now playing</span>
      </button>
      <button class="browse-play" :aria-label="player.playing ? 'Pause' : 'Play'" :disabled="!player.ready" @click="emit('toggle')">
        <span class="material-symbols-outlined" aria-hidden="true">{{ player.playing ? "pause" : "play_arrow" }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.browse-shell {
  --accent: #ff8393;
  --panel: #17151e;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #faf8fc;
}
.browse-shell[data-theme="1"] {
  --panel: #080808;
}
.browse-shell[data-theme="2"] {
  --accent: #83d5ff;
  --panel: #10202a;
}
.browse-shell[data-theme="3"] {
  --accent: #c5a2ff;
  --panel: #1c1727;
}
.search-bar,
.browse-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 clamp(6px, 2vw, 16px);
  background: var(--panel);
  border-block-end: 1px solid #ffffff12;
}
.browse-toolbar {
  border-block-end: 0;
  border-block-start: 1px solid #ffffff12;
}
form {
  flex: 1;
  min-width: 0;
  display: flex;
  border: 1px solid #ffffff1c;
  border-radius: 25px;
  background: #ffffff0b;
}
form:focus-within {
  border-color: var(--accent);
}
input {
  flex: 1;
  width: 0;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  padding: 0 0 0 14px;
  color: inherit;
  font: inherit;
  font-size: 15px;
}
input::placeholder {
  color: #bcb4c6;
}
button {
  display: grid;
  place-content: center;
  justify-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
button:not(:disabled):hover {
  background: #ffffff12;
}
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
button:disabled {
  opacity: 0.42;
  cursor: default;
}
.search-submit {
  border-radius: 50%;
}
.browse-toolbar button:not(.browse-play) {
  flex: 1;
  gap: 2px;
  font-size: 10px;
  white-space: nowrap;
}
.now-tab,
.browse-play {
  color: var(--accent);
}
.browse-play {
  border-radius: 50%;
  background: #ffffff0d;
}
</style>
