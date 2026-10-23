import type {
  Camera,
  ComplexCoordinate,
} from "../fractal/types";
import {
  MANDELBROT_VIEW_ASPECT_RATIO,
  mandelbrotOverviewDiagonal,
} from "../fractal/mandelbrot-domain";
import { SCORE_CONFIG_RATIOS } from "./score-config";

export const MAX_ROUND_SCORE = 5000;

export const SCORING_RULESET = {
  id: "normalized-distance-v1",
  maximum: MAX_ROUND_SCORE,
} as const;

export type GuessScore = {
  points: number;
  maximum: number;
  coordinateDistance: number;
  normalizedDistance: number;
};

export type LabScore = {
  points: number;
  maximum: number;
  coordinateDistance: number;
  mapRelativeDistance: number;
  questionRelativeDistance: number;
  halfDistance: number;
  fullScoreTolerance: number;
  decayConstant: number;
  usedFullScoreTolerance: boolean;
};

/** 1 question-screen diagonal of error halves the displayed score. */
export function scoreFromNormalizedDistance(normalizedDistance: number) {
  const boundedDistance = Math.max(0, normalizedDistance);
  return Math.round(MAX_ROUND_SCORE * 2 ** -boundedDistance);
}

export function scoreGuess(
  camera: Camera,
  guess: ComplexCoordinate,
  answer: ComplexCoordinate,
): GuessScore {
  const coordinateDistance = Math.hypot(
    guess.re - answer.re,
    guess.im - answer.im,
  );
  const viewportHeight = camera.viewportWidth / MANDELBROT_VIEW_ASPECT_RATIO;
  const viewportDiagonal = Math.hypot(camera.viewportWidth, viewportHeight);
  const normalizedDistance = coordinateDistance / viewportDiagonal;

  return {
    points: scoreFromNormalizedDistance(normalizedDistance),
    maximum: MAX_ROUND_SCORE,
    coordinateDistance,
    normalizedDistance,
  };
}

/**
 * Experimental scoring used only by Generator Lab. `halfDistance` is a
 * fraction of the overview diagonal and `fullScoreTolerance` is a fraction of
 * one question-screen diagonal.
 */
export function scoreLabGuess(
  guess: ComplexCoordinate,
  answer: ComplexCoordinate,
  magnification: number,
  halfDistance: number = SCORE_CONFIG_RATIOS.halfDistance,
  fullScoreTolerance: number = SCORE_CONFIG_RATIOS.fullScoreTolerance,
): LabScore {
  if (
    !Number.isFinite(guess.re) ||
    !Number.isFinite(guess.im) ||
    !Number.isFinite(answer.re) ||
    !Number.isFinite(answer.im)
  ) {
    throw new Error("ANSWERとGUESSは有限の座標で指定してください。");
  }
  if (!Number.isFinite(magnification) || magnification <= 0) {
    throw new Error("倍率は0より大きい有限値で指定してください。");
  }
  if (!Number.isFinite(halfDistance) || halfDistance <= 0) {
    throw new Error("Half distanceは0より大きい値で指定してください。");
  }
  if (!Number.isFinite(fullScoreTolerance) || fullScoreTolerance < 0) {
    throw new Error("Full-score toleranceは0以上で指定してください。");
  }

  const coordinateDistance = Math.hypot(
    guess.re - answer.re,
    guess.im - answer.im,
  );
  const overviewDiagonal = mandelbrotOverviewDiagonal();
  const mapRelativeDistance = coordinateDistance / overviewDiagonal;
  const questionRelativeDistance = mapRelativeDistance * magnification;
  const usedFullScoreTolerance =
    questionRelativeDistance <= fullScoreTolerance;
  const points = usedFullScoreTolerance
    ? MAX_ROUND_SCORE
    : Math.round(
        MAX_ROUND_SCORE * 2 ** (-mapRelativeDistance / halfDistance),
      );

  return {
    points,
    maximum: MAX_ROUND_SCORE,
    coordinateDistance,
    mapRelativeDistance,
    questionRelativeDistance,
    halfDistance,
    fullScoreTolerance,
    decayConstant: Math.LN2 / halfDistance,
    usedFullScoreTolerance,
  };
}
