import type { ViewportInteraction, ZoomLimits } from "../fractal/types";

export type GameRules = {
  magnification: number;
  roundCount: number;
  questionPanAllowed: boolean;
  questionInspectAllowed: boolean;
};

export type QuestionGenerationRules = Pick<
  GameRules,
  "magnification" | "roundCount"
>;

export const DEFAULT_GAME_RULES: GameRules = {
  magnification: 30,
  roundCount: 5,
  questionPanAllowed: false,
  questionInspectAllowed: false,
};

export const MIN_MAGNIFICATION = 10;
export const MAX_MAGNIFICATION = 10_000;
export const MIN_ROUND_COUNT = 1;
export const MAX_ROUND_COUNT = 20;
export const MAGNIFICATION_OPTIONS = [
  10,
  30,
  100,
  300,
  1000,
  3000,
  10000,
];
export const ROUND_COUNT_OPTIONS = [1, 3, 5, 10];

export const GAME_RULESET_VERSION = "prototype-09";

export const EXPLORATION_MIN_ZOOM = 0.8;
export const EXPLORATION_ZOOM_MULTIPLIER = 4;
export const EXPLORATION_MAX_ZOOM = 40_000;

export function isValidMagnification(value: number) {
  return (
    Number.isFinite(value) &&
    value >= MIN_MAGNIFICATION &&
    value <= MAX_MAGNIFICATION
  );
}

export function isValidRoundCount(value: number) {
  return (
    Number.isInteger(value) &&
    value >= MIN_ROUND_COUNT &&
    value <= MAX_ROUND_COUNT
  );
}

export function parseGameRules(value: unknown): GameRules | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GameRules>;
  if (
    !isValidMagnification(candidate.magnification as number) ||
    !isValidRoundCount(candidate.roundCount as number) ||
    typeof candidate.questionPanAllowed !== "boolean" ||
    typeof candidate.questionInspectAllowed !== "boolean"
  ) {
    return null;
  }
  return value as GameRules;
}

export function parseLegacyGameRules(value: unknown): GameRules | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GameRules>;
  if (
    !isValidMagnification(candidate.magnification as number) ||
    !isValidRoundCount(candidate.roundCount as number) ||
    typeof candidate.questionPanAllowed !== "boolean"
  ) {
    return null;
  }
  return {
    magnification: candidate.magnification as number,
    roundCount: candidate.roundCount as number,
    questionPanAllowed: candidate.questionPanAllowed,
    questionInspectAllowed: false,
  };
}

export function validateQuestionGenerationRules(
  settings: QuestionGenerationRules,
) {
  if (!isValidMagnification(settings.magnification)) {
    throw new Error(
      `倍率は${MIN_MAGNIFICATION}〜${MAX_MAGNIFICATION}の範囲で指定してください。`,
    );
  }
  if (!isValidRoundCount(settings.roundCount)) {
    throw new Error(
      `ラウンド数は${MIN_ROUND_COUNT}〜${MAX_ROUND_COUNT}の整数で指定してください。`,
    );
  }
}

export function explorationZoomLimit(questionMagnification: number) {
  return Math.min(
    EXPLORATION_MAX_ZOOM,
    Math.max(40, questionMagnification * EXPLORATION_ZOOM_MULTIPLIER),
  );
}

export function createQuestionZoomLimits(magnification: number): ZoomLimits {
  return {
    min: magnification,
    max: explorationZoomLimit(magnification),
  };
}

export function questionViewportInteraction(
  rules: Pick<
    GameRules,
    "questionPanAllowed" | "questionInspectAllowed"
  >,
): ViewportInteraction {
  return {
    pan: rules.questionPanAllowed,
    zoom: rules.questionInspectAllowed,
    select: false,
  };
}

export function formatRoundCount(roundCount: number) {
  return `${roundCount} ${roundCount === 1 ? "ROUND" : "ROUNDS"}`;
}
