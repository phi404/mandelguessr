import { MANDELBROT_OVERVIEW_CAMERA } from "./mandelbrot-domain";
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
  max: 100_000,
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
  return {
    re: camera.centerRe + normalizedX * camera.viewportWidth,
    im: camera.centerIm + normalizedY * height,
  };
}

export function complexToScreen(
  coordinate: ComplexCoordinate,
  camera: Camera,
  size: ViewportSize,
): ProjectedCoordinate {
  const height = viewportHeight(camera.viewportWidth, size);
  const x = 0.5 + (coordinate.re - camera.centerRe) / camera.viewportWidth;
  const y = 0.5 - (coordinate.im - camera.centerIm) / height;
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
  const height = viewportHeight(camera.viewportWidth, size);
  return {
    ...camera,
    centerRe: camera.centerRe - (delta.x / size.width) * camera.viewportWidth,
    centerIm: camera.centerIm + (delta.y / size.height) * height,
  };
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
  return {
    centerRe: anchor.re - normalizedX * nextViewportWidth,
    centerIm: anchor.im - normalizedY * nextHeight,
    viewportWidth: nextViewportWidth,
  };
}

export function fixedCenterCorrection(
  snapshot: ViewSnapshot,
  fixedCenter: ComplexCoordinate,
): ViewSnapshot | null {
  if (
    Math.abs(snapshot.centerRe - fixedCenter.re) <= 1e-15 &&
    Math.abs(snapshot.centerIm - fixedCenter.im) <= 1e-15
  ) {
    return null;
  }

  return {
    ...snapshot,
    centerRe: fixedCenter.re,
    centerIm: fixedCenter.im,
  };
}
