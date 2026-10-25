export const MANDELBROT_VIEW_ASPECT_RATIO = 1.6;

/** Any change to these formula/color-index constants requires a new spec. */
export const MANDELBROT_RENDERER_SPEC_VERSION = "mandelbrot-renderer-v3";
export const MANDELBROT_POWER = 2;
export const MANDELBROT_FORMULA_BAILOUT_SQUARED = 10_000;
export const MANDELBROT_SMOOTH_BAILOUT = 128;
export const MANDELBROT_SMOOTH_INDEX_SCALE = 0.05;
export const MANDELBROT_COLOR_DENSITY = 0.42;
export const MANDELBROT_MAX_ITERATIONS = 32768;
export const MANDELBROT_MAX_ZOOM = 1e20;

export const MANDELBROT_OVERVIEW_CAMERA = {
  centerRe: -0.55,
  centerIm: 0,
  viewportWidth: 3.6,
} as const;

export type MandelbrotBounds = {
  left: number;
  right: number;
  bottom: number;
  top: number;
  width: number;
  height: number;
};

export function mandelbrotOverviewBounds(): MandelbrotBounds {
  const width = MANDELBROT_OVERVIEW_CAMERA.viewportWidth;
  const height = width / MANDELBROT_VIEW_ASPECT_RATIO;
  return {
    left: MANDELBROT_OVERVIEW_CAMERA.centerRe - width / 2,
    right: MANDELBROT_OVERVIEW_CAMERA.centerRe + width / 2,
    bottom: MANDELBROT_OVERVIEW_CAMERA.centerIm - height / 2,
    top: MANDELBROT_OVERVIEW_CAMERA.centerIm + height / 2,
    width,
    height,
  };
}

export function mandelbrotOverviewDiagonal() {
  const { width, height } = mandelbrotOverviewBounds();
  return Math.hypot(width, height);
}

export function questionViewportGeometry(magnification: number) {
  if (!Number.isFinite(magnification) || magnification <= 0) {
    throw new Error("倍率は0より大きい有限値で指定してください。");
  }
  const overview = mandelbrotOverviewBounds();
  const width = overview.width / magnification;
  const height = overview.height / magnification;
  return {
    width,
    height,
    diagonal: Math.hypot(width, height),
  };
}

export function fullQualityIterationsForZoom(zoom: number) {
  const logZoom = Math.max(0, Math.log10(zoom));
  return Math.min(
    MANDELBROT_MAX_ITERATIONS,
    Math.max(500, Math.round(500 + 300 * logZoom + 250 * logZoom ** 2)),
  );
}
