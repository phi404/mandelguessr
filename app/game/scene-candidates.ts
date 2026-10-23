import type { Camera, ComplexCoordinate } from "../fractal/types";
import {
  MANDELBROT_SMOOTH_BAILOUT,
  fullQualityIterationsForZoom,
  mandelbrotOverviewBounds,
  questionViewportGeometry,
} from "../fractal/mandelbrot-domain";
import { createSeededRandom } from "./seed";

export type ExteriorProbe = {
  escaped: boolean;
  correction: ComplexCoordinate | null;
  distance: number | null;
};

/** Newton correction for the exterior potential, log|z| * z / (dz/dc).
 * It is an estimate, not a certified distance to the mathematical set.
 */
export function probeExterior(re: number, im: number, iterations: number): ExteriorProbe {
  const bulbRe = re + 1;
  const cardioidRe = re - 1 / 4;
  const q = cardioidRe * cardioidRe + im * im;
  if (bulbRe * bulbRe + im * im <= 1 / 16 ||
      q * (q + cardioidRe) <= im * im / 4) {
    return { escaped: false, correction: null, distance: null };
  }
  let zr = 0, zi = 0, dr = 0, di = 0;
  let escaped = false;
  // Squaring grows the orbit rapidly after radius 2. The extra budget follows
  // the shared renderer's smoothing radius instead of a separate fixed limit.
  const continuation = Math.ceil(Math.log2(MANDELBROT_SMOOTH_BAILOUT));
  for (let n = 0; n < iterations + continuation; n += 1) {
    if (!escaped && n >= iterations) break;
    const nextDr = 2 * (zr * dr - zi * di) + 1;
    di = 2 * (zr * di + zi * dr);
    dr = nextDr;
    const nextZr = zr * zr - zi * zi + re;
    zi = 2 * zr * zi + im;
    zr = nextZr;
    const magnitudeSquared = zr * zr + zi * zi;
    escaped ||= magnitudeSquared > 4;
    if (escaped && magnitudeSquared > MANDELBROT_SMOOTH_BAILOUT ** 2) break;
  }
  if (!escaped) return { escaped: false, correction: null, distance: null };
  const denominator = dr * dr + di * di;
  const logMagnitude = Math.log(Math.hypot(zr, zi));
  const correction = {
    re: logMagnitude * (zr * dr + zi * di) / denominator,
    im: logMagnitude * (zi * dr - zr * di) / denominator,
  };
  const distance = Math.hypot(correction.re, correction.im);
  if (!(distance > 0) || !Number.isFinite(distance)) {
    return { escaped: true, correction: null, distance: null };
  }
  return { escaped: true, correction, distance };
}

export type SceneCandidate = {
  camera: Camera;
  anchor: ComplexCoordinate;
  representative: ComplexCoordinate;
  proposalIndex: number;
  projectionSteps: number;
};

function boundaryBracket(
  outside: ComplexCoordinate,
  nonEscaped: ComplexCoordinate,
  iterations: number,
  pixelDiagonal: number,
): ComplexCoordinate {
  while (Math.hypot(outside.re - nonEscaped.re, outside.im - nonEscaped.im) > pixelDiagonal) {
    const middle = { re: (outside.re + nonEscaped.re) / 2, im: (outside.im + nonEscaped.im) / 2 };
    if ((middle.re === outside.re && middle.im === outside.im) ||
        (middle.re === nonEscaped.re && middle.im === nonEscaped.im)) break;
    if (probeExterior(middle.re, middle.im, iterations).escaped) outside = middle;
    else nonEscaped = middle;
  }
  return { re: (outside.re + nonEscaped.re) / 2, im: (outside.im + nonEscaped.im) / 2 };
}

export function projectToBoundary(
  anchor: ComplexCoordinate,
  magnification: number,
  analysisWidth: number,
  analysisHeight: number,
): { representative: ComplexCoordinate; steps: number } | null {
  const viewport = questionViewportGeometry(magnification);
  const pixelDiagonal = Math.hypot(viewport.width / analysisWidth, viewport.height / analysisHeight);
  const overview = mandelbrotOverviewBounds();
  // The number of bisections needed to reach one analysis pixel is also the
  // projection work budget. Failure retries a fresh anchor, never lowers quality.
  const workBudget = Math.ceil(Math.log2(Math.hypot(overview.width, overview.height) / pixelDiagonal));
  const iterations = fullQualityIterationsForZoom(magnification);
  let point = anchor;
  let probe = probeExterior(point.re, point.im, iterations);
  for (let step = 0; step < workBudget; step += 1) {
    if (!probe.escaped || probe.distance === null || !probe.correction) return null;
    if (probe.distance <= pixelDiagonal) return { representative: point, steps: step };
    let correction = probe.correction;
    let next = { re: point.re - correction.re, im: point.im - correction.im };
    let nextProbe = probeExterior(next.re, next.im, iterations);
    // Backtracking halves a Newton step until the potential-distance estimate
    // decreases. A non-escaped hit brackets a finite-iteration boundary.
    while (nextProbe.escaped && (nextProbe.distance === null || nextProbe.distance >= probe.distance)) {
      correction = { re: correction.re / 2, im: correction.im / 2 };
      if (Math.hypot(correction.re, correction.im) <= pixelDiagonal) return null;
      next = { re: point.re - correction.re, im: point.im - correction.im };
      nextProbe = probeExterior(next.re, next.im, iterations);
    }
    if (!nextProbe.escaped) {
      return { representative: boundaryBracket(point, next, iterations, pixelDiagonal), steps: step + 1 };
    }
    point = next;
    probe = nextProbe;
  }
  return null;
}

/** Each call has the same rule; there is no selected-image/cell history. */
export function createSceneCandidateSampler(magnification: number, seed: number, width: number, height: number) {
  const random = createSeededRandom(seed);
  const overview = mandelbrotOverviewBounds();
  const viewport = questionViewportGeometry(magnification);
  let proposalIndex = 0;
  return (): SceneCandidate | null => {
    const index = proposalIndex++;
    const anchor = { re: overview.left + random() * overview.width, im: overview.bottom + random() * overview.height };
    const projected = projectToBoundary(anchor, magnification, width, height);
    if (!projected) return null;
    const camera = {
      centerRe: projected.representative.re + (random() - 1 / 2) * viewport.width,
      centerIm: projected.representative.im + (random() - 1 / 2) * viewport.height,
      viewportWidth: viewport.width,
    };
    if (camera.centerRe < overview.left || camera.centerRe > overview.right ||
        camera.centerIm < overview.bottom || camera.centerIm > overview.top) return null;
    return { camera, anchor, representative: projected.representative, proposalIndex: index, projectionSteps: projected.steps };
  };
}
