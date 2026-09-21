(function () {
  // YouTube's proxy custom elements keep their state on `inst` now. Older
  // clients expose it directly or on `polymerController`. Resolve each time:
  // navigation can replace either the element or its controller.
  const getController = element => element?.polymerController ?? element?.inst ?? element;
  const getPlayerBar = () => getController(document.querySelector("ytmusic-player-bar"));
  const getPlayerApi = () => getPlayerBar()?.playerApi ?? getController(document.querySelector("ytmusic-player"))?.playerApi;

  window.__YTMD_PLAYER__ = Object.freeze({ getController, getPlayerBar, getPlayerApi });
});
