<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import TitleBar from "../../components/TitleBar.vue";
import YTMViewLoading from "../../components/YTMViewLoading.vue";
import logo from "~assets/icons/ytmd_white.png";
import SmallDisplayPlayer from "../../components/SmallDisplayPlayer.vue";
import SmallDisplayQueue from "../../components/SmallDisplayQueue.vue";
import SmallDisplayBrowse from "../../components/SmallDisplayBrowse.vue";
import {
  EMPTY_SMALL_DISPLAY_PLAYER,
  SmallDisplayPlayer as PlayerSnapshot,
  SmallDisplayPresentation,
  SmallDisplayQueue as QueueSnapshot
} from "~shared/small-display";

const presentation = ref<SmallDisplayPresentation>({ enabled: false, browsing: false, theme: 0 });
const player = ref<PlayerSnapshot>({ ...EMPTY_SMALL_DISPLAY_PLAYER });
const fullscreen = ref(false);
const browseQuery = ref("");
const queueOpen = ref(false);
const queue = ref<QueueSnapshot>({ items: [], hasMore: false });
const display = window.ytmd.smallDisplay;
const removeQueue = display.onQueue(value => {
  queue.value = value;
});
watch(queueOpen, open => {
  if (open) queue.value = { items: [], hasMore: false };
  display.watchQueue(open);
});
let presentationReceived = false;
const removePresentation = display.onPresentation(value => {
  presentationReceived = true;
  presentation.value = value;
  if (!value.enabled || value.browsing) queueOpen.value = false;
});
const removePlayer = display.onState(value => {
  player.value = value;
});
const removeWindow = window.ytmd.handleWindowEvents((_event, value) => {
  fullscreen.value = value.fullscreen;
});
onBeforeUnmount(() => {
  removePresentation();
  removeQueue();
  if (queueOpen.value) display.watchQueue(false);
  removePlayer();
  removeWindow();
  window.onfocus = null;
});

const keyboardFocus = ref<HTMLElement>(null);
const keyboardFocusZero = ref<HTMLElement>(null);

onMounted(() => {
  void display.getPresentation().then(value => {
    if (value && !presentationReceived) presentation.value = value;
  });
  void display.getState().then(value => {
    if (value) player.value = value;
  });
  window.onfocus = () => {
    if (presentation.value.enabled) return;
    if (document.activeElement != keyboardFocusZero.value) {
      // This resets the focus of keyboard navigation
      keyboardFocusZero.value.focus();
      keyboardFocusZero.value.blur();
    }
    window.ytmd.switchFocus("ytm");
  };

  keyboardFocus.value.onfocus = () => {
    if (!presentation.value.enabled || presentation.value.browsing) window.ytmd.switchFocus("ytm");
  };

  window.ytmd.requestWindowState();
});
</script>

<template>
  <div ref="keyboardFocusZero" tabindex="0"></div>
  <Suspense>
    <TitleBar
      is-main-window
      :has-home-button="!presentation.enabled"
      :has-open-in-browser-button="!presentation.enabled"
      has-settings-button
      has-minimize-button
      has-maximize-button
      :title="presentation.enabled ? 'YTM' : 'YTM Desktop'"
      :icon-file="logo"
    >
      <template #app-buttons>
        <button
          class="display-toggle"
          :aria-label="presentation.enabled ? 'Return to desktop layout' : 'Enable small display mode'"
          :aria-pressed="presentation.enabled"
          title="Small display mode"
          @click="display.setMode(!presentation.enabled)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">tablet_mac</span>
        </button>
      </template>
    </TitleBar>
  </Suspense>
  <div v-if="presentation.enabled" class="small-display-host" :class="{ fullscreen }">
    <SmallDisplayBrowse
      v-if="presentation.browsing"
      v-model:query="browseQuery"
      :player="player"
      :fullscreen="fullscreen"
      :theme="presentation.theme"
      @player="display.browse(false)"
      @back="display.back()"
      @search="display.search"
      @page="display.browsePage"
      @toggle="display.command('playPause')"
      @fullscreen="display.fullscreen()"
    />
    <SmallDisplayQueue
      v-else-if="queueOpen"
      :queue="queue"
      :title="player.title"
      :playing="player.playing"
      :disabled="player.adPlaying || !player.ready"
      @back="queueOpen = false"
      @browse="display.browse(true)"
      @play="display.playQueueItem"
      @toggle="display.command('playPause')"
    />
    <SmallDisplayPlayer
      v-else
      :player="player"
      :theme="presentation.theme"
      :fullscreen="fullscreen"
      @command="display.command"
      @browse="display.browse(true)"
      @queue="queueOpen = true"
      @desktop="display.setMode(false)"
      @fullscreen="display.fullscreen()"
      @screen="display.chooseDisplay()"
    />
  </div>
  <Suspense v-else>
    <YTMViewLoading />
  </Suspense>
  <div ref="keyboardFocus" tabindex="32767"></div>
</template>

<style scoped>
.small-display-host {
  height: calc(100% - 36px);
}
.small-display-host.fullscreen {
  height: 100%;
}
.display-toggle {
  height: 32px;
  width: 36px;
  border: 0;
  background: transparent;
  color: #bbb;
  -webkit-app-region: no-drag;
  cursor: pointer;
}
.display-toggle[aria-pressed="true"] {
  color: #ff6477;
}
.display-toggle .material-symbols-outlined {
  font-size: 18px;
}
</style>
