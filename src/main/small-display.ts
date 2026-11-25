import type { PlayerState } from "./player-state-store";
import { EMPTY_SMALL_DISPLAY_PLAYER, SmallDisplayPlayer, SmallDisplayQueue } from "../shared/small-display";

export function smallDisplayQueue(state: PlayerState): SmallDisplayQueue {
  const queue = state.queue;
  if (!queue) return { items: [], hasMore: false };
  const size = queue.items.length + queue.automixItems.length;
  const current = queue.selectedItemIndex;
  const start = Math.max(0, current - 4);
  const limit = Math.min(size, start + 60);
  const items: SmallDisplayQueue["items"] = [];
  for (let index = start; index < limit; index++) {
    const item = index < queue.items.length ? queue.items[index] : queue.automixItems[index - queue.items.length];
    if (!item?.videoId) continue;
    const images = item.thumbnails ?? [];
    items.push({
      index,
      id: item.videoId,
      title: item.title?.slice(0, 250) || "Untitled track",
      artist: item.author?.slice(0, 180) ?? "",
      artwork: images.find(image => /^https:\/\//.test(image.url) && image.width >= 64)?.url ?? "",
      duration: item.duration?.slice(0, 12) ?? "",
      current: index === current
    });
  }
  return { items, hasMore: limit < size };
}

export function smallDisplaySnapshot(state: PlayerState): SmallDisplayPlayer {
  const details = state.videoDetails;
  const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
  const duration = Math.max(0, finite(details?.durationSeconds));
  const artwork = [...(details?.thumbnails ?? [])].filter(image => /^https:\/\//.test(image.url)).sort((a, b) => a.width - b.width);
  const image = artwork.find(image => image.width >= 480) ?? artwork.at(-1);
  return {
    title: details?.title?.slice(0, 500) || EMPTY_SMALL_DISPLAY_PLAYER.title,
    artist: details?.author?.slice(0, 300) || EMPTY_SMALL_DISPLAY_PLAYER.artist,
    album: details?.album?.slice(0, 300) ?? "",
    artwork: image?.url ?? "",
    ready: !!details?.id,
    playing: state.trackState === 1,
    buffering: state.trackState === 2,
    live: details?.isLive === true,
    adPlaying: state.adPlaying === true,
    liked: details?.likeStatus === 2,
    repeatMode: state.queue?.repeatMode ?? 0,
    duration,
    progress: Math.max(0, Math.min(finite(state.videoProgress), duration || Number.MAX_SAFE_INTEGER)),
    volume: Math.max(0, Math.min(100, finite(state.volume, 50))),
    muted: state.muted === true
  };
}
