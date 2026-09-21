(function () {
  const ytmStore = window.__YTMD_HOOK__.ytmStore;
  let lastStoreSnapshot = null;
  let storeUpdateScheduled = false;
  let lastProgressSentAt = 0;

  function sendStoreState() {
    // We don't want to see everything in the store as there can be some sensitive data so we only send what's necessary to operate
    let state = ytmStore.getState();

    const videoId = window.__YTMD_PLAYER__.getPlayerApi().getPlayerResponse()?.videoDetails?.videoId;
    const likeButtonData = window.__YTMD_PLAYER__.getController(document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer"))?.data;
    const defaultLikeStatus = likeButtonData?.likeStatus ?? "UNKNOWN";
    const storeLikeStatus = state.likeStatus.videos[videoId];

    const likeStatus = storeLikeStatus ? state.likeStatus.videos[videoId] : defaultLikeStatus;
    const volume = state.player.volume;
    const adPlaying = state.player.adPlaying;
    const muted = state.player.muted;

    const snapshot = { queue: state.queue, likeStatus, volume, adPlaying, muted };
    if (
      lastStoreSnapshot &&
      lastStoreSnapshot.queue === snapshot.queue &&
      lastStoreSnapshot.likeStatus === snapshot.likeStatus &&
      lastStoreSnapshot.volume === snapshot.volume &&
      lastStoreSnapshot.adPlaying === snapshot.adPlaying &&
      lastStoreSnapshot.muted === snapshot.muted
    ) {
      return;
    }
    lastStoreSnapshot = snapshot;

    window.ytmd.sendStoreUpdate(state.queue, likeStatus, volume, muted, adPlaying);
  }

  function scheduleStoreState() {
    if (storeUpdateScheduled) return;
    storeUpdateScheduled = true;
    setTimeout(() => {
      storeUpdateScheduled = false;
      sendStoreState();
    }, 100);
  }

  window.__YTMD_PLAYER__.getPlayerApi().addEventListener("onVideoProgress", progress => {
    const now = performance.now();
    if (now - lastProgressSentAt < 500) return;
    lastProgressSentAt = now;
    window.ytmd.sendVideoProgress(progress);
  });
  window.__YTMD_PLAYER__.getPlayerApi().addEventListener("onStateChange", state => {
    window.ytmd.sendVideoState(state);
  });
  window.__YTMD_PLAYER__.getPlayerApi().addEventListener("onVideoDataChange", event => {
    if (event.playertype === 1 && (event.type === "dataloaded" || event.type === "dataupdated")) {
      let videoDetails = window.__YTMD_PLAYER__.getPlayerApi().getPlayerResponse().videoDetails;
      let playlistId = window.__YTMD_PLAYER__.getPlayerApi().getPlaylistId();
      let album = null;
      let hasFullMetadata = false;

      // If playing from online sources this usually is filled out with the first dataupdated which is followed after dataloaded. While offline this is always filled
      let currentItem = window.__YTMD_PLAYER__.getPlayerBar().currentItem;
      if (currentItem !== null && currentItem !== undefined) {
        hasFullMetadata = true;

        // Fill out video details with better information
        videoDetails.title = currentItem.title.runs.map(v => v.text).join(""); // Can contain featuring text which isn't in player response
        videoDetails.thumbnail = currentItem.thumbnail; // Can contain more thumbnails than player response

        for (let i = 0; i < currentItem.longBylineText.runs.length; i++) {
          const item = currentItem.longBylineText.runs[i];
          if (item.navigationEndpoint) {
            if (
              item.navigationEndpoint.browseEndpoint.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType === "MUSIC_PAGE_TYPE_ALBUM"
            ) {
              album = {
                id: item.navigationEndpoint.browseEndpoint.browseId,
                text: item.text
              };
            }
          }
        }
      }

      let state = ytmStore.getState();
      const likeButtonData = window.__YTMD_PLAYER__.getController(document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer"))?.data;
      const defaultLikeStatus = likeButtonData?.likeStatus ?? "UNKNOWN";
      const storeLikeStatus = state.likeStatus.videos[videoDetails.videoId];

      const likeStatus = storeLikeStatus ? state.likeStatus.videos[videoDetails.videoId] : defaultLikeStatus;

      window.ytmd.sendVideoData(videoDetails, playlistId, album, likeStatus, hasFullMetadata);
    }
  });
  ytmStore.subscribe(() => {
    scheduleStoreState();
  });
  window.addEventListener("yt-action", e => {
    if (e.detail.actionName === "yt-service-request") {
      if (e.detail.args[1].createPlaylistServiceEndpoint) {
        let title = e.detail.args[2].create_playlist_title;
        let returnValue = e.detail.returnValue;
        returnValue[0].ajaxPromise.then(response => {
          let id = response.data.playlistId;
          window.ytmd.sendCreatePlaylistObservation({
            title,
            id
          });
        });
      }
    } else if (e.detail.actionName === "yt-handle-playlist-deletion-command") {
      let playlistId = e.detail.args[0].handlePlaylistDeletionCommand.playlistId;
      window.ytmd.sendDeletePlaylistObservation(playlistId);
    }
  });
});
