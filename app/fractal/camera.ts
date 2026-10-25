import { MANDELBROT_MAX_ZOOM, MANDELBROT_OVERVIEW_CAMERA } from "./mandelbrot-domain";
import { ddAdd, ddNumber, ddSubtract } from "./double-double";
import type {
  Camera,
  ComplexCoordinate,
  ViewSnapshot,
  ZoomLimits,
} from "./types";

export type ViewportSize = {
  width: number;
  height: number;
};

export type ScreenCoordinate = {
  x: number;
  y: number;
};

export type ProjectedCoordinate = ScreenCoordinate & {
  visible: boolean;
};

export const INITIAL_CAMERA: Camera = {
  ...MANDELBROT_OVERVIEW_CAMERA,
};

export const DEFAULT_ZOOM_LIMITS: ZoomLimits = {
  min: 0.7,
  max: MANDELBROT_MAX_ZOOM,
};

export function viewportHeight(
  viewportWidth: number,
  size: ViewportSize,
) {
  return viewportWidth * (size.height / Math.max(size.width, 1));
}

export function screenToComplex(
  point: ScreenCoordinate,
  camera: Camera,
  size: ViewportSize,
): ComplexCoordinate {
  const normalizedX = point.x / Math.max(size.width, 1) - 0.5;
  const normalizedY = 0.5 - point.y / Math.max(size.height, 1);
  const height = viewportHeight(camera.viewportWidth, size);
  const re = ddAdd([camera.centerRe, camera.centerReLow ?? 0], [normalizedX * camera.viewportWidth, 0]);
  const im = ddAdd([camera.centerIm, camera.centerImLow ?? 0], [normalizedY * height, 0]);
  return { re: re[0], im: im[0], reLow: re[1], imLow: im[1] };
}

export function complexToScreen(
  coordinate: ComplexCoordinate,
  camera: Camera,
  size: ViewportSize,
): ProjectedCoordinate {
  const height = viewportHeight(camera.viewportWidth, size);
  const x = 0.5 + ddNumber(ddSubtract([coordinate.re, coordinate.reLow ?? 0], [camera.centerRe, camera.centerReLow ?? 0])) / camera.viewportWidth;
  const y = 0.5 - ddNumber(ddSubtract([coordinate.im, coordinate.imLow ?? 0], [camera.centerIm, camera.centerImLow ?? 0])) / height;
  return {
    x,
    y,
    visible: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
}

export function viewportWidthToZoom(viewportWidth: number) {
  return INITIAL_CAMERA.viewportWidth / viewportWidth;
}

export function zoomToViewportWidth(zoom: number) {
  return INITIAL_CAMERA.viewportWidth / Math.max(zoom, 0.01);
}

export function normalizeZoomLimits(limits?: ZoomLimits): ZoomLimits {
  const minimum = Math.max(0.01, limits?.min ?? DEFAULT_ZOOM_LIMITS.min);
  const maximum = Math.max(minimum, limits?.max ?? DEFAULT_ZOOM_LIMITS.max);
  return { min: minimum, max: maximum };
}

export function clampViewportWidth(
  viewportWidthValue: number,
  zoomLimits: ZoomLimits,
) {
  const minimumWidth = INITIAL_CAMERA.viewportWidth / zoomLimits.max;
  const maximumWidth = INITIAL_CAMERA.viewportWidth / zoomLimits.min;
  return Math.max(minimumWidth, Math.min(maximumWidth, viewportWidthValue));
}

export function panCameraByScreenDelta(
  camera: Camera,
  delta: ScreenCoordinate,
  size: ViewportSize,
): Camera {
  const center = screenToComplex({ x: size.width / 2 - delta.x, y: size.height / 2 - delta.y }, camera, size);
  return { ...camera, centerRe: center.re, centerIm: center.im, centerReLow: center.reLow, centerImLow: center.imLow };
}

export function cameraForAnchoredViewportWidth(
  camera: Camera,
  previousAnchor: ScreenCoordinate,
  nextAnchor: ScreenCoordinate,
  size: ViewportSize,
  nextViewportWidth: number,
): Camera {
  const anchor = screenToComplex(previousAnchor, camera, size);
  const normalizedX = nextAnchor.x / size.width - 0.5;
  const normalizedY = 0.5 - nextAnchor.y / size.height;
  const nextHeight = viewportHeight(nextViewportWidth, size);
  const re = ddAdd([anchor.re, anchor.reLow ?? 0], [-normalizedX * nextViewportWidth, 0]);
  const im = ddAdd([anchor.im, anchor.imLow ?? 0], [-normalizedY * nextHeight, 0]);
  return { centerRe: re[0], centerIm: im[0], centerReLow: re[1], centerImLow: im[1], viewportWidth: nextViewportWidth };
}

export function fixedCenterCorrection(
  snapshot: ViewSnapshot,
  fixedCenter: ComplexCoordinate,
): ViewSnapshot | null {
  if (
    snapshot.centerRe === fixedCenter.re && snapshot.centerIm === fixedCenter.im &&
    (snapshot.centerReLow ?? 0) === (fixedCenter.reLow ?? 0) && (snapshot.centerImLow ?? 0) === (fixedCenter.imLow ?? 0)
  ) {
    return null;
  }

  return {
    ...snapshot,
    centerRe: fixedCenter.re,
    centerIm: fixedCenter.im,
    ...(fixedCenter.reLow !== undefined ? { centerReLow: fixedCenter.reLow } : snapshot.centerReLow !== undefined ? { centerReLow: 0 } : {}),
    ...(fixedCenter.imLow !== undefined ? { centerImLow: fixedCenter.imLow } : snapshot.centerImLow !== undefined ? { centerImLow: 0 } : {}),
  };
}

/** Normalize wheel units and cap each event to a 10% change in magnification. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0, pageHeight = 800) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  const pixels = Math.max(-120, Math.min(120, deltaY * unit));
  return Math.exp(pixels * Math.log(1.1) / 120);
}
