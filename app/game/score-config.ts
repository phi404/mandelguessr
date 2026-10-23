export const SCORE_CONFIG = {
  /** Score-halving distance as a percentage of the overview-map diagonal. */
  halfDistance: 3,
  /** Full-score tolerance as a percentage of one question-screen diagonal. */
  fullScoreTolerance: 3,
} as const;

export const SCORE_CONFIG_RATIOS = {
  halfDistance: SCORE_CONFIG.halfDistance / 100,
  fullScoreTolerance: SCORE_CONFIG.fullScoreTolerance / 100,
} as const;
