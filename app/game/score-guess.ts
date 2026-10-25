import type {
  Camera,
  ComplexCoordinate,
} from "../fractal/types";
import {
  MANDELBROT_VIEW_ASPECT_RATIO,
  MANDELBROT_OVERVIEW_CAMERA,
  mandelbrotOverviewDiagonal,
} from "../fractal/mandelbrot-domain";
import { SCORE_CONFIG, SCORE_CONFIG_RATIOS } from "./score-config";
import { ddNumber, ddSubtract } from "../fractal/double-double";

export const MAX_ROUND_SCORE = 5000;

export const SCORING_RULESET = {
  id: `map-distance-v2-h${SCORE_CONFIG.halfDistance}-tau${SCORE_CONFIG.fullScoreTolerance}`,
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

export function scoreGuess(
  camera: Camera,
  guess: ComplexCoordinate,
  answer: ComplexCoordinate,
): GuessScore {
  const score = scoreLabGuess(
    guess,
    answer,
    MANDELBROT_OVERVIEW_CAMERA.viewportWidth / camera.viewportWidth,
  );
  const viewportHeight = camera.viewportWidth / MANDELBROT_VIEW_ASPECT_RATIO;
  const viewportDiagonal = Math.hypot(camera.viewportWidth, viewportHeight);
  const normalizedDistance = score.coordinateDistance / viewportDiagonal;

  return {
    points: score.points,
    maximum: MAX_ROUND_SCORE,
    coordinateDistance: score.coordinateDistance,
    normalizedDistance,
  };
}

/**
 * Shared scoring for the game and Generator Lab. `halfDistance` is a
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
    ddNumber(ddSubtract([guess.re, guess.reLow ?? 0], [answer.re, answer.reLow ?? 0])),
    ddNumber(ddSubtract([guess.im, guess.imLow ?? 0], [answer.im, answer.imLow ?? 0])),
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
