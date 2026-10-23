import type { Camera, ComplexCoordinate } from "../fractal/types";

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type ClippedSegment = {
  start: NormalizedPoint;
  end: NormalizedPoint;
};

const RESULT_MAP_PADDING = 0.14;

export function fitResultCamera(
  guess: ComplexCoordinate,
  target: ComplexCoordinate,
  viewportHeightRatio: number,
  minimumViewportWidth: number,
): Camera {
  const usableFraction = 1 - RESULT_MAP_PADDING * 2;
  const safeHeightRatio = Math.max(viewportHeightRatio, 0.01);
  const horizontalWidth = Math.abs(guess.re - target.re) / usableFraction;
  const verticalWidth = Math.abs(guess.im - target.im) /
    (safeHeightRatio * usableFraction);

  return {
    centerRe: (guess.re + target.re) / 2,
    centerIm: (guess.im + target.im) / 2,
    viewportWidth: Math.max(
      minimumViewportWidth,
      horizontalWidth,
      verticalWidth,
    ),
  };
}

export function clipSegmentToViewport(
  start: NormalizedPoint,
  end: NormalizedPoint,
): ClippedSegment | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minimum = 0;
  let maximum = 1;

  const clips = [
    [-dx, start.x],
    [dx, 1 - start.x],
    [-dy, start.y],
    [dy, 1 - start.y],
  ] as const;

  for (const [direction, distance] of clips) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return null;
  }

  return {
    start: { x: start.x + minimum * dx, y: start.y + minimum * dy },
    end: { x: start.x + maximum * dx, y: start.y + maximum * dy },
  };
}
