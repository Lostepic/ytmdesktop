/** A bounded snapshot for the local touch UI, not the full player queue. */
export type SmallDisplayPlayer = {
  title: string;
  artist: string;
  album: string;
  artwork: string;
  ready: boolean;
  playing: boolean;
  buffering: boolean;
  live: boolean;
  adPlaying: boolean;
  liked: boolean;
  repeatMode: number;
  duration: number;
  progress: number;
  volume: number;
  muted: boolean;
};

export type SmallDisplayPresentation = { enabled: boolean; browsing: boolean; theme: number };
export type SmallDisplayBrowsePage = "home" | "explore" | "library";
// The desktop shell reserves these same CSS pixels around the music view.
export const SMALL_DISPLAY_SEARCH_HEIGHT = 56;
export const SMALL_DISPLAY_TABS_HEIGHT = 60;
export const SMALL_DISPLAY_QUERY_LIMIT = 180;

export function smallDisplaySearchEndpoint(value: unknown) {
  if (typeof value !== "string") return;
  const query = value.trim();
  if (!query || query.length > SMALL_DISPLAY_QUERY_LIMIT) return;
  return {
    searchEndpoint: { query },
    commandMetadata: { webCommandMetadata: { url: `/search?q=${encodeURIComponent(query)}`, webPageType: "WEB_PAGE_TYPE_SEARCH" } }
  };
}
export function smallDisplayBrowseEndpoint(page: unknown): string | undefined {
  switch (page) {
    case "home":
      return "FEmusic_home";
    case "explore":
      return "FEmusic_explore";
    case "library":
      return "FEmusic_library_landing";
  }
}
export type SmallDisplayQueueItem = { index: number; id: string; title: string; artist: string; artwork: string; duration: string; current: boolean };
export type SmallDisplayQueue = { items: SmallDisplayQueueItem[]; hasMore: boolean };
export type SmallDisplayCommand = "previous" | "playPause" | "next" | "toggleLike" | "shuffle" | "repeatMode" | "seekTo" | "setVolume" | "mute" | "unmute";

export const EMPTY_SMALL_DISPLAY_PLAYER: SmallDisplayPlayer = {
  title: "Ready when you are",
  artist: "Choose something in Browse music",
  album: "",
  artwork: "",
  ready: false,
  playing: false,
  buffering: false,
  live: false,
  adPlaying: false,
  liked: false,
  repeatMode: 0,
  duration: 0,
  progress: 0,
  volume: 50,
  muted: false
};

export function validSmallDisplayCommand(command: unknown, value: unknown, duration: number): command is SmallDisplayCommand {
  if (typeof command !== "string") return false;
  if (["previous", "playPause", "next", "toggleLike", "shuffle", "mute", "unmute"].includes(command)) return value === undefined;
  if (command === "repeatMode") return ["NONE", "ALL", "ONE"].includes(value as string);
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (command === "setVolume") return value >= 0 && value <= 100;
  return command === "seekTo" && Number.isFinite(duration) && duration > 0 && value >= 0 && value <= duration;
}
