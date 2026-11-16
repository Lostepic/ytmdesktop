export const EQUALIZER_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQUALIZER_PRESETS: Record<string, number[]> = {
  "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass boost": [4, 4, 3, 1, 0, 0, 0, 0, 0, 0],
  "Vocal clarity": [-2, -2, -1, 0, 1, 2, 3, 2, 0, -1],
  "Treble lift": [0, 0, 0, 0, 0, 0, 1, 2, 3, 3]
};

export type EqualizerSettings = { enabled: boolean; gains: number[]; preampDb: number; automaticHeadroom: boolean };
export type EqualizerStatus = {
  state: "off" | "flat" | "waiting" | "active" | "bypassed" | "unavailable" | "suspended";
  message: string;
  sampleRate: number | null;
  preampDb: number | null;
};

export function normalizeEqualizerSettings(input: unknown): EqualizerSettings {
  const value = input && typeof input === "object" ? (input as Partial<EqualizerSettings>) : {};
  const bounded = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0);
  return {
    enabled: value.enabled === true,
    gains: EQUALIZER_FREQUENCIES.map((_, i) => bounded(Array.isArray(value.gains) ? value.gains[i] : 0, -12, 12)),
    preampDb: bounded(value.preampDb, -12, 6),
    automaticHeadroom: value.automaticHeadroom !== false
  };
}
