import type { Camera, ComplexCoordinate } from "../fractal/types";
import { ddAdd, ddMultiply, ddNumber, ddSubtract } from "../fractal/double-double";

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
  const horizontalWidth = Math.abs(ddNumber(ddSubtract([guess.re,guess.reLow ?? 0],[target.re,target.reLow ?? 0]))) / usableFraction;
  const verticalWidth = Math.abs(ddNumber(ddSubtract([guess.im,guess.imLow ?? 0],[target.im,target.imLow ?? 0]))) /
    (safeHeightRatio * usableFraction);
  const re = ddMultiply(ddAdd([guess.re,guess.reLow ?? 0],[target.re,target.reLow ?? 0]),[0.5,0]);
  const im = ddMultiply(ddAdd([guess.im,guess.imLow ?? 0],[target.im,target.imLow ?? 0]),[0.5,0]);

  return {
    centerRe: re[0], ...(re[1] ? { centerReLow: re[1] } : {}),
    centerIm: im[0], ...(im[1] ? { centerImLow: im[1] } : {}),
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
