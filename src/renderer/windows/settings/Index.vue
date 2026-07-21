<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";
import TitleBar from "../../components/TitleBar.vue";
import Settings from "./Settings.vue";

const settingsError = ref(false);
onErrorCaptured(error => {
  console.error("Failed to load settings", error);
  settingsError.value = true;
  return false;
});
</script>

<template>
  <div class="container">
    <TitleBar class="titlebar" title="Settings" icon="settings" />
    <Suspense v-if="!settingsError">
      <Settings class="settings" />
      <template #fallback>
        <div class="settings status">
          <span class="spinner material-symbols-outlined">progress_activity</span>
          <p>Loading settings…</p>
        </div>
      </template>
    </Suspense>
    <div v-else class="settings status error">
      <span class="material-symbols-outlined">error</span>
      <h2>Settings could not be loaded</h2>
      <p>Close this window and try again.</p>
    </div>
  </div>
</template>

<style scoped>
.settings {
  background: #0d0d13;
  height: calc(100% - 36px);
}

.container {
  width: 100%;
  height: 100%;
  background: #0d0d13;
}

.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #aaa6af;
}

.status .material-symbols-outlined {
  font-size: 30px;
  color: #ff5261;
}
.status h2 {
  margin: 12px 0 0;
  color: #f6f7fb;
  font-size: 18px;
}
.status p {
  margin: 8px 0;
}
.spinner {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
