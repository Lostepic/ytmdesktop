(function () {
  let volume = window.__YTMD_PLAYER__.getPlayerApi().getVolume();
  window.__YTMD_PLAYER__.getPlayerApi().setVolume(volume);
  window.__YTMD_HOOK__.ytmStore.dispatch({ type: "SET_VOLUME", payload: volume });
});
