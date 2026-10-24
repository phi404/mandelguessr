export const WINDOW_TITLEBAR_HEIGHT = 38;
export const WINDOW_ASPECT_RATIO = 8 / 5;
const BORDER = 2;
const EDGE_GAP = 12;

export type WindowBounds = { width: number; height: number; bottomInset: number };
export type WindowLayout = { x: number; y: number; width: number; minimized: boolean };
export type ResizeCorner = "top-left" | "bottom-right";

export function windowWidthLimits(bounds: WindowBounds) {
  const maximum = Math.max(BORDER, Math.min(
    bounds.width - EDGE_GAP * 2,
    (bounds.height - bounds.bottomInset - WINDOW_TITLEBAR_HEIGHT - BORDER - EDGE_GAP * 2) * WINDOW_ASPECT_RATIO + BORDER,
  ));
  return { minimum: Math.min(180, maximum), maximum };
}

export function visibleWindowWidth(layout: WindowLayout) {
  return layout.minimized ? Math.min(layout.width, 210) : layout.width;
}

export function windowHeight(layout: WindowLayout) {
  return WINDOW_TITLEBAR_HEIGHT + BORDER + (layout.minimized ? 0 : (layout.width - BORDER) / WINDOW_ASPECT_RATIO);
}

export function constrainWindow(layout: WindowLayout, bounds: WindowBounds): WindowLayout {
  const { minimum, maximum } = windowWidthLimits(bounds);
  const next = { ...layout, width: Math.max(minimum, Math.min(maximum, layout.width)) };
  return {
    ...next,
    x: Math.max(0, Math.min(bounds.width - visibleWindowWidth(next), next.x)),
    y: Math.max(0, Math.min(bounds.height - bounds.bottomInset - windowHeight(next), next.y)),
  };
}

export function initialWindow(bounds: WindowBounds): WindowLayout {
  const compact = bounds.width < 600;
  const width = Math.min(470, Math.max(compact ? 210 : 280, bounds.width * (compact ? 0.58 : 0.34)));
  const layout = constrainWindow({ x: 0, y: 0, width, minimized: false }, bounds);
  return constrainWindow({
    ...layout,
    x: bounds.width - layout.width - EDGE_GAP,
    y: bounds.height - bounds.bottomInset - windowHeight(layout) - EDGE_GAP,
  }, bounds);
}

export function resizeWindow(layout: WindowLayout, requestedWidth: number, bounds: WindowBounds, corner: ResizeCorner): WindowLayout {
  const resized = constrainWindow({ ...layout, width: requestedWidth }, bounds);
  return constrainWindow({
    ...resized,
    x: corner === "top-left" ? layout.x + layout.width - resized.width : layout.x,
    y: corner === "top-left" ? layout.y + windowHeight(layout) - windowHeight(resized) : layout.y,
  }, bounds);
}

export function toggleWindowMinimized(layout: WindowLayout, bounds: WindowBounds): WindowLayout {
  const next = { ...layout, minimized: !layout.minimized };
  return constrainWindow({
    ...next,
    x: layout.x + visibleWindowWidth(layout) - visibleWindowWidth(next),
    y: layout.y + windowHeight(layout) - windowHeight(next),
  }, bounds);
}
