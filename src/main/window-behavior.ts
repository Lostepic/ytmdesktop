import type { BrowserWindow, Input, Rectangle } from "electron";

export function showAuxiliaryWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

export function visibleWindowBounds(saved: Rectangle | null, workAreas: Rectangle[], minimum = { width: 720, height: 500 }): Rectangle {
  const primary = workAreas[0];
  const valid = saved && Object.values(saved).every(Number.isFinite) && saved.width > 0 && saved.height > 0;
  const bounds = valid ? saved : { x: primary.x, y: primary.y, width: 1280, height: 720 };
  let area = primary;
  let greatestOverlap = 0;
  for (const candidate of workAreas) {
    const overlap =
      Math.max(0, Math.min(bounds.x + bounds.width, candidate.x + candidate.width) - Math.max(bounds.x, candidate.x)) *
      Math.max(0, Math.min(bounds.y + bounds.height, candidate.y + candidate.height) - Math.max(bounds.y, candidate.y));
    if (overlap > greatestOverlap) {
      greatestOverlap = overlap;
      area = candidate;
    }
  }
  const width = Math.min(Math.max(minimum.width, bounds.width), area.width);
  const height = Math.min(Math.max(minimum.height, bounds.height), area.height);
  const x = valid && greatestOverlap ? Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)) : area.x + (area.width - width) / 2;
  const y = valid && greatestOverlap ? Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) : area.y + (area.height - height) / 2;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function settingsWindowPlacement(parent: Rectangle, workArea: Rectangle) {
  const width = Math.min(800, workArea.width);
  const height = Math.min(600, workArea.height);
  const target = {
    x: parent.x + (parent.width - width) / 2,
    y: parent.y + (parent.height - height) / 2,
    width,
    height
  };

  return {
    ...visibleWindowBounds(target, [workArea], { width: 1, height: 1 }),
    minWidth: Math.min(520, width),
    minHeight: Math.min(320, height)
  };
}

export function isCloseWindowShortcut(input: Input, isMac: boolean): boolean {
  return (
    input.type === "keyDown" &&
    !input.isAutoRepeat &&
    input.key.toLowerCase() === "w" &&
    !input.alt &&
    !input.shift &&
    (isMac ? input.meta && !input.control : input.control && !input.meta)
  );
}
