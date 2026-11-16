import { EQUALIZER_FREQUENCIES, EqualizerStatus, normalizeEqualizerSettings } from "~shared/audio";

const mediaSelector = "ytmusic-player video, video.html5-main-video";

/** Native Web Audio nodes; no per-sample JavaScript, forced sample rate or output-device override. */
export class EqualizerController {
  private settings = normalizeEqualizerSettings(null);
  private key = "";
  private appliedKey = "";
  private context: AudioContext | null = null;
  private preamp: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private probes: BiquadFilterNode[] = [];
  private effectivePreamp = 0;
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private active: { element: HTMLMediaElement; source: MediaElementAudioSourceNode } | null = null;
  private processing: boolean | null = null;
  private everAttached = false;
  private observer: MutationObserver | null = null;
  private queued = false;
  private resuming = false;
  private lastStatus = "";

  constructor(
    private document: Document,
    private report: (status: EqualizerStatus) => void
  ) {}

  public update(input: unknown): void {
    const settings = normalizeEqualizerSettings(input);
    const key = JSON.stringify(settings);
    if (key === this.key) return;
    this.key = key;
    this.settings = settings;
    this.reconcile();
  }

  private needsProcessing(): boolean {
    return (
      this.settings.enabled &&
      (this.settings.gains.some(gain => gain !== 0) || this.settings.preampDb < 0 || (!this.settings.automaticHeadroom && this.settings.preampDb > 0))
    );
  }

  private status(state: EqualizerStatus["state"], message: string): void {
    const status = { state, message, sampleRate: this.context?.sampleRate ?? null, preampDb: this.processing ? this.effectivePreamp : null };
    const key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.report(status);
    }
  }

  private schedule = (): void => {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.reconcile();
    });
  };

  private activate = (): void => {
    // A pre-gesture resume() may remain pending indefinitely. Retry from the
    // interaction itself instead of letting the in-flight guard suppress it.
    if (this.context && this.context.state !== "running" && this.context.state !== "closed") {
      void this.context.resume().catch(() => {});
    }
    this.schedule();
  };

  private observe(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(records => {
      if (this.active && !this.active.element.isConnected) {
        this.schedule();
        return;
      }
      if (!this.needsProcessing() && !this.everAttached) return;
      if (
        records.some(record =>
          [...record.addedNodes].some(node => node instanceof Element && (node.matches(mediaSelector) || node.querySelector(mediaSelector)))
        )
      )
        this.schedule();
    });
    this.observer.observe(this.document.body, { childList: true, subtree: true });
    for (const event of ["loadedmetadata", "play", "visibilitychange"]) this.document.addEventListener(event, this.schedule, true);
    for (const event of ["pointerdown", "pointerup", "keydown"]) this.document.addEventListener(event, this.activate, true);
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const event of ["loadedmetadata", "play", "visibilitychange"]) this.document.removeEventListener(event, this.schedule, true);
    for (const event of ["pointerdown", "pointerup", "keydown"]) this.document.removeEventListener(event, this.activate, true);
  }

  private isSafeSource(element: HTMLMediaElement): boolean {
    if (element.mediaKeys) return false;
    try {
      const url = new URL(element.currentSrc || element.src, this.document.location.href);
      return (
        url.protocol === "data:" ||
        url.origin === this.document.location.origin ||
        element.crossOrigin === "anonymous" ||
        element.crossOrigin === "use-credentials"
      );
    } catch {
      return false;
    }
  }

  private prepareContext(): boolean {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "balanced" });
      this.preamp = this.context.createGain();
      this.filters = EQUALIZER_FREQUENCIES.map(frequency => this.makeFilter(frequency));
      this.probes = EQUALIZER_FREQUENCIES.map(frequency => this.makeFilter(frequency));
      this.preamp.connect(this.filters[0]);
      this.filters.slice(0, -1).forEach((filter, i) => filter.connect(this.filters[i + 1]));
      this.context.addEventListener("statechange", this.schedule);
    }
    if (this.context.state === "running") return true;
    if (this.context.state === "closed") {
      this.status("unavailable", "Audio processing stopped. Reload the player to use the EQ again.");
      return false;
    }
    if (!this.resuming) {
      this.resuming = true;
      void this.context
        .resume()
        .then(() => {
          if (this.context?.state === "running") this.schedule();
        })
        .catch(() => {})
        .finally(() => {
          this.resuming = false;
        });
    }
    this.status("suspended", "Click in the player to activate audio processing. Unconnected sources keep their original audio.");
    return false;
  }

  private makeFilter(frequency: number): BiquadFilterNode {
    const filter = this.context.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = Math.min(frequency, this.context.sampleRate * 0.49);
    filter.Q.value = Math.SQRT2;
    return filter;
  }

  private applyParameters(): void {
    if (this.appliedKey === this.key) return;
    // Measure the requested curve with unconnected probes, not values still ramping in the live graph.
    const frequencies = Float32Array.from({ length: 512 }, (_, i) => 20 * (Math.min(22000, this.context.sampleRate * 0.49) / 20) ** (i / 511));
    const magnitudes = new Float32Array(512);
    const phases = new Float32Array(512);
    const response = new Float64Array(512).fill(1);
    this.probes.forEach((filter, band) => {
      filter.gain.value = this.settings.gains[band];
      filter.getFrequencyResponse(frequencies, magnitudes, phases);
      response.forEach((_, i) => {
        response[i] *= magnitudes[i];
      });
    });
    const peakDb = Math.max(0, 20 * Math.log10(Math.max(...response)));
    this.effectivePreamp = this.settings.automaticHeadroom ? Math.min(this.settings.preampDb, -peakDb - (peakDb > 0.05 ? 1 : 0)) : this.settings.preampDb;
    const now = this.context.currentTime;
    const gain = this.preamp.gain;
    const target = 10 ** (this.effectivePreamp / 20);
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(target, now, target < gain.value ? 0.005 : 0.05);
    this.filters.forEach((filter, i) => {
      filter.gain.cancelScheduledValues(now);
      filter.gain.setTargetAtTime(this.settings.gains[i], now, 0.02);
    });
    this.appliedKey = this.key;
  }

  private bypass(): void {
    if (this.active && this.context?.state !== "closed" && this.processing !== false) {
      this.active.source.disconnect();
      this.filters.at(-1)?.disconnect();
      this.active.source.connect(this.context.destination);
      this.processing = false;
    }
  }

  private reconcile(): void {
    if (this.active && !this.active.element.isConnected) {
      this.active.source.disconnect();
      this.active = null;
      this.processing = null;
    }
    if (!this.needsProcessing()) {
      const element = this.document.querySelector<HTMLMediaElement>(mediaSelector);
      const source = element && this.sources.get(element);
      if (source && this.active?.element !== element) {
        this.active?.source.disconnect();
        this.active = { element, source };
        this.processing = null;
      }
      if (this.active && !this.prepareContext()) return;
      this.bypass();
      if (!this.everAttached) this.stopObserving();
      this.status(
        this.active ? "bypassed" : this.settings.enabled ? "flat" : "off",
        this.active
          ? "EQ bypassed; filters are disconnected."
          : this.settings.enabled
            ? "Flat curve; original playback is unchanged."
            : "EQ off; original playback is unchanged."
      );
      return;
    }
    this.observe();
    const element = this.document.querySelector<HTMLMediaElement>(mediaSelector);
    if (!element || !(element.currentSrc || element.getAttribute("src"))) {
      this.status("waiting", "Start playback to apply the EQ.");
      return;
    }
    if (!this.isSafeSource(element)) {
      this.bypass();
      this.status("unavailable", "This source cannot be processed safely. New unsupported sources are left unchanged; reload if an attached source changed.");
      return;
    }
    try {
      if (!this.prepareContext()) return;
      this.applyParameters();
      if (this.active?.element !== element) {
        this.active?.source.disconnect();
        const source = this.sources.get(element) ?? this.context.createMediaElementSource(element);
        this.sources.set(element, source);
        this.everAttached = true;
        this.active = { element, source };
        this.processing = null;
      }
      if (this.processing !== true) {
        this.active.source.disconnect();
        this.filters.at(-1).disconnect();
        this.filters.at(-1).connect(this.context.destination);
        this.active.source.connect(this.preamp);
        this.processing = true;
      }
      this.status("active", "EQ active. Automatic headroom reduces clipping risk; source quality is unchanged.");
    } catch {
      this.bypass();
      this.status("unavailable", "EQ could not attach to this player. Existing audio routing is kept where possible; reload to reset processing.");
    }
  }
}
