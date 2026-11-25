<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { SmallDisplayQueue } from "~shared/small-display";
import { installDragScroll } from "../drag-scroll";

const props = defineProps<{ queue: SmallDisplayQueue; title: string; playing: boolean; disabled: boolean }>();
const emit = defineEmits<{ back: []; browse: []; play: [index: number, id: string]; toggle: [] }>();
const list = ref<HTMLElement>(null);
const atStart = ref(true);
const atEnd = ref(true);
let positioned = false;
let removeDrag: (() => void) | undefined;
let observer: ResizeObserver;
function updateScroll() {
  if (!list.value) return;
  const { scrollTop, scrollHeight, clientHeight } = list.value;
  atStart.value = scrollTop < 2;
  atEnd.value = scrollTop + clientHeight >= scrollHeight - 2;
}
function page(direction: number) {
  list.value?.scrollBy({ top: direction * Math.max(64, list.value.clientHeight - 64), behavior: "instant" });
}
watch(
  () => props.queue,
  async () => {
    await nextTick();
    if (!positioned && props.queue.items.length) {
      positioned = true;
      list.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "start" });
    }
    updateScroll();
  },
  { immediate: true }
);
onMounted(() => {
  removeDrag = installDragScroll(list.value, () => list.value);
  observer = new ResizeObserver(updateScroll);
  observer.observe(list.value);
});
onBeforeUnmount(() => {
  removeDrag?.();
  observer?.disconnect();
});
</script>

<template>
  <main class="queue-view" aria-label="Up Next">
    <header>
      <button aria-label="Back to now playing" @click="emit('back')"><span aria-hidden="true" class="material-symbols-outlined">arrow_back</span></button>
      <h1>Up Next</h1>
      <button aria-label="Browse music" @click="emit('browse')"><span aria-hidden="true" class="material-symbols-outlined">library_music</span> Browse</button>
    </header>
    <div class="queue-content">
      <div ref="list" class="queue-scroll" aria-label="Track list" tabindex="0" @scroll.passive="updateScroll">
        <p v-if="!queue.items.length" class="empty">No tracks queued. Browse music to start playing.</p>
        <button
          v-for="item in queue.items"
          :key="`${item.index}:${item.id}`"
          class="track"
          :aria-current="item.current ? 'true' : undefined"
          :disabled="disabled"
          @click="emit('play', item.index, item.id)"
        >
          <span class="cover"
            ><img v-if="item.artwork" :src="item.artwork" loading="lazy" alt="" referrerpolicy="no-referrer" draggable="false" /><span
              v-else
              aria-hidden="true"
              class="material-symbols-outlined"
              >music_note</span
            ></span
          >
          <span class="track-copy"
            ><strong>{{ item.title }}</strong
            ><span>{{ item.artist }}</span></span
          >
          <span v-if="item.current" class="current">Current</span><span v-else class="duration">{{ item.duration }}</span>
        </button>
        <p v-if="queue.hasMore" class="empty">For the rest of the queue, open Browse.</p>
      </div>
      <div v-if="queue.items.length" class="page-buttons" aria-label="Queue scrolling">
        <button aria-label="Scroll queue up" :disabled="atStart" @click="page(-1)">
          <span aria-hidden="true" class="material-symbols-outlined">keyboard_arrow_up</span>
        </button>
        <button aria-label="Scroll queue down" :disabled="atEnd" @click="page(1)">
          <span aria-hidden="true" class="material-symbols-outlined">keyboard_arrow_down</span>
        </button>
      </div>
    </div>
    <footer>
      <button :aria-label="playing ? 'Pause' : 'Play'" :disabled="disabled" @click="emit('toggle')">
        <span aria-hidden="true" class="material-symbols-outlined">{{ playing ? "pause" : "play_arrow" }}</span></button
      ><span>{{ title }}</span>
    </footer>
  </main>
</template>

<style scoped>
.queue-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 8px;
  padding: 8px 14px;
  background: #101019;
}
header,
footer {
  display: flex;
  align-items: center;
  gap: 10px;
}
h1 {
  font-size: clamp(20px, 3vw, 30px);
  margin: 0;
  flex: 1;
}
button {
  color: #f8f5fb;
  min-height: 44px;
  min-width: 44px;
  border: 1px solid #ffffff20;
  border-radius: 12px;
  background: #ffffff09;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  touch-action: manipulation;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.queue-content {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.queue-scroll {
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: auto;
  scrollbar-color: #6a6177 transparent;
  touch-action: pan-y;
  padding: 2px 5px 2px 2px;
  user-select: none;
}
.track {
  display: flex;
  width: 100%;
  text-align: left;
  min-height: 58px;
  margin: 0 0 4px;
  padding: 5px 8px;
  border-color: transparent;
  touch-action: pan-y;
}
.track[aria-current="true"] {
  background: #ff647721;
  border-color: #ff647747;
}
.cover {
  width: 42px;
  height: 42px;
  flex: none;
  background: #262431;
  border-radius: 8px;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.track-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.track-copy > * {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.track-copy span,
.duration,
.empty {
  color: #c2bacd;
  font-size: 12px;
}
.current {
  color: #ffa1ac;
  font-size: 12px;
}
.page-buttons {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
}
footer {
  border-top: 1px solid #ffffff18;
  padding-top: 6px;
}
footer span:last-child {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
