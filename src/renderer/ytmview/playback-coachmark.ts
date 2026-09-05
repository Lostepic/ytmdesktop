// The popup container and its dropdowns are shared with menus and dialogs.
// Only the restored-playback hint itself may be hidden.
export function suppressRestoredPlaybackCoachmark(): void {
  const label = "Start playback";
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let hintObserver: MutationObserver | undefined;
  let hiddenHint: HTMLElement | undefined;
  let previousDisplay = "";
  let previousPriority = "";

  const restoreHint = () => {
    if (hiddenHint) {
      if (previousDisplay) hiddenHint.style.setProperty("display", previousDisplay, previousPriority);
      else hiddenHint.style.removeProperty("display");
      hiddenHint = undefined;
    }
  };

  const cleanup = () => {
    clearTimeout(scanTimer);
    clearTimeout(discoveryTimer);
    discoveryObserver.disconnect();
    hintObserver?.disconnect();
    restoreHint();
    window.removeEventListener("pagehide", cleanup);
  };

  const findAndHide = () => {
    const hint = Array.from(document.querySelectorAll<HTMLElement>("yt-bubble-hint-renderer")).find(element => element.textContent?.trim() === label);
    if (!hint) return;

    hiddenHint = hint;
    previousDisplay = hint.style.getPropertyValue("display");
    previousPriority = hint.style.getPropertyPriority("display");
    hint.style.setProperty("display", "none", "important");
    discoveryObserver.disconnect();
    clearTimeout(discoveryTimer);

    // YouTube may reuse this hint renderer for a different message later.
    hintObserver = new MutationObserver(() => {
      if (hint.textContent?.trim() !== label) cleanup();
    });
    hintObserver.observe(hint, { childList: true, subtree: true, characterData: true });
  };

  const discoveryObserver = new MutationObserver(() => {
    if (scanTimer !== undefined) return;
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      findAndHide();
    }, 50);
  });
  discoveryObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  const discoveryTimer = setTimeout(cleanup, 10_000);
  window.addEventListener("pagehide", cleanup, { once: true });
  findAndHide();
}
