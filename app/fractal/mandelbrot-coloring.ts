import {
  MANDELBROT_COLOR_DENSITY,
  MANDELBROT_FORMULA_BAILOUT_SQUARED,
  MANDELBROT_POWER,
  MANDELBROT_SMOOTH_BAILOUT,
  MANDELBROT_SMOOTH_INDEX_SCALE,
} from "./mandelbrot-domain";

export type MandelbrotColorSample = {
  escaped: boolean;
  escapeIteration: number | null;
  finalZ: { re: number; im: number };
  smoothIndex: number | null;
  densityIndex: number | null;
  transferredIndex: number | null;
  cyclicPosition: number | null;
};

/**
 * Repeats a transferred Ultra Fractal gradient index in the positive
 * direction. Negative, zero, and non-finite indices select gradient entry 0;
 * they must never be folded into the palette with fract().
 */
export function repeatNonNegativeGradientIndex(transferredIndex: number) {
  if (!(transferredIndex > 0) || !Number.isFinite(transferredIndex)) return 0;
  return transferredIndex - Math.floor(transferredIndex);
}

/**
 * CPU reference for Renderer Spec v1. `escapeIteration` is one-based: it is
 * the number of completed z <- z^2 + c loop bodies, matching UF's #numiter.
 */
export function calculateMandelbrotColorSample(
  re: number,
  im: number,
  maxIterations: number,
): MandelbrotColorSample {
  let zr = 0;
  let zi = 0;

  for (let loopIndex = 0; loopIndex < maxIterations; loopIndex += 1) {
    const nextRe = zr * zr - zi * zi + re;
    zi = 2 * zr * zi + im;
    zr = nextRe;

    if (zr * zr + zi * zi > MANDELBROT_FORMULA_BAILOUT_SQUARED) {
      const escapeIteration = loopIndex + 1;
      const magnitude = Math.hypot(zr, zi);
      const smoothIndex = MANDELBROT_SMOOTH_INDEX_SCALE * (
        escapeIteration +
        (
          Math.log(Math.log(MANDELBROT_SMOOTH_BAILOUT)) -
          Math.log(Math.log(magnitude))
        ) / Math.log(MANDELBROT_POWER)
      );
      const densityIndex = MANDELBROT_COLOR_DENSITY * smoothIndex;
      // Ultra Fractal's built-in Log transfer is ln(1 + densityIndex), not
      // ln(densityIndex). One cycle satisfies 1+d2 = e(1+d1); only at large
      // density does that approach an e-fold increase in the smooth index.
      const transferredIndex = densityIndex > 0 ? Math.log1p(densityIndex) : 0;
      const cyclicPosition = repeatNonNegativeGradientIndex(transferredIndex);

      return {
        escaped: true,
        escapeIteration,
        finalZ: { re: zr, im: zi },
        smoothIndex,
        densityIndex,
        transferredIndex,
        cyclicPosition,
      };
    }
  }

  return {
    escaped: false,
    escapeIteration: null,
    finalZ: { re: zr, im: zi },
    smoothIndex: null,
    densityIndex: null,
    transferredIndex: null,
    cyclicPosition: null,
  };
}
