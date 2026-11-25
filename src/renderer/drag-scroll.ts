/** spacedesk can report a finger swipe as a left mouse drag. Keep native touch scrolling intact. */
export function installDragScroll(root: HTMLElement | Document, findScroller: (event: PointerEvent, axis: "x" | "y") => HTMLElement | null): () => void {
  let gesture: {
    id: number;
    x: number;
    y: number;
    vertical: HTMLElement | null;
    horizontal: HTMLElement | null;
    start: number;
    axis: "x" | "y" | null;
  } | null = null;
  let suppressClickUntil = 0;
  const down = (event: PointerEvent) => {
    suppressClickUntil = 0;
    if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    if (event.composedPath().some(node => node instanceof Element && node.matches("input, textarea, select, [contenteditable], [role=slider], video"))) return;
    const vertical = findScroller(event, "y");
    const horizontal = findScroller(event, "x");
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      vertical: vertical && vertical.scrollHeight > vertical.clientHeight + 1 ? vertical : null,
      horizontal: horizontal && horizontal.scrollWidth > horizontal.clientWidth + 1 ? horizontal : null,
      start: 0,
      axis: null
    };
    if (!gesture.vertical && !gesture.horizontal) gesture = null;
  };
  const move = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      gesture = null;
      return;
    }
    const dy = event.clientY - gesture.y;
    const dx = event.clientX - gesture.x;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      const axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      const scroller = axis === "x" ? gesture.horizontal : gesture.vertical;
      if (!scroller) {
        gesture = null;
        return;
      }
      gesture.axis = axis;
      gesture.start = axis === "x" ? scroller.scrollLeft : scroller.scrollTop;
    }
    event.preventDefault();
    if (gesture.axis === "x" && gesture.horizontal) gesture.horizontal.scrollLeft = gesture.start - dx;
    if (gesture.axis === "y" && gesture.vertical) gesture.vertical.scrollTop = gesture.start - dy;
  };
  const up = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.axis) suppressClickUntil = performance.now() + 350;
    gesture = null;
  };
  const click = (event: MouseEvent) => {
    if (event.detail === 0 || performance.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const drag = (event: DragEvent) => {
    if (gesture) event.preventDefault();
  };
  root.addEventListener("pointerdown", down, true);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  root.addEventListener("click", click, true);
  root.addEventListener("dragstart", drag, true);
  return () => {
    root.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    root.removeEventListener("click", click, true);
    root.removeEventListener("dragstart", drag, true);
  };
}
