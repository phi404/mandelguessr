import type { ViewSnapshot } from "../fractal/types";
import { GAME_RULESET_VERSION, type GameRules } from "./game-rules";
import { QUESTION_GENERATOR_VERSION } from "./question-generator";
import type { PrototypeQuestion } from "./question-generator";
import { SCORING_RULESET, type GuessScore } from "./score-guess";

const STORAGE_KEY = "mandelguessr.playtest.v1";
const SCHEMA_VERSION = 5;
const MAX_SAMPLES = 500;

export type QuestionFeedback = "good" | "too-hard" | "poor-frame";

export type PlaytestRoundSample = {
  schemaVersion: typeof SCHEMA_VERSION;
  recordedAt: string;
  sessionId: string;
  gameSeed: number;
  roundIndex: number;
  rules: {
    game: typeof GAME_RULESET_VERSION;
    generator: string;
    scoring: typeof SCORING_RULESET.id;
  };
  gameRules: GameRules;
  question: {
    id: string;
    camera: PrototypeQuestion["camera"];
    magnification: number;
    generation?: PrototypeQuestion["generation"];
    gridSize?: number;
    cellColumn?: number;
    cellRow?: number;
  };
  result: Pick<
    GuessScore,
    "points" | "coordinateDistance" | "normalizedDistance"
  >;
  behavior: {
    elapsedMs: number;
    mapZoom: number | null;
    mapZoomRatio: number | null;
    questionPanDistance: number;
  };
  device: {
    pixelRatio: number;
    viewportWidth: number;
    viewportHeight: number;
    touchPoints: number;
    rendererPrecision: ViewSnapshot["precision"] | null;
  };
  feedback?: QuestionFeedback;
};

function readSamples(): PlaytestRoundSample[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as PlaytestRoundSample[] : [];
  } catch {
    return [];
  }
}

export function createSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function appendPlaytestRound(
  sample: Omit<PlaytestRoundSample, "schemaVersion" | "recordedAt" | "rules">,
) {
  if (typeof window === "undefined") return;

  const next: PlaytestRoundSample = {
    ...sample,
    schemaVersion: SCHEMA_VERSION,
    recordedAt: new Date().toISOString(),
    rules: {
      game: GAME_RULESET_VERSION,
      generator: sample.question.generation?.version ?? QUESTION_GENERATOR_VERSION,
      scoring: SCORING_RULESET.id,
    },
  };

  try {
    const samples = [...readSamples(), next].slice(-MAX_SAMPLES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Play must continue even if storage is disabled or full.
  }
}

export function playtestSampleCount() {
  return readSamples().length;
}

export function clearPlaytestData() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function setPlaytestRoundFeedback(
  sessionId: string,
  roundIndex: number,
  feedback: QuestionFeedback,
) {
  if (typeof window === "undefined") return;
  try {
    const samples = readSamples();
    const sampleIndex = samples.findLastIndex(
      (sample) =>
        sample.sessionId === sessionId && sample.roundIndex === roundIndex,
    );
    if (sampleIndex < 0) return;
    samples[sampleIndex] = { ...samples[sampleIndex], feedback };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Feedback is optional and must never interrupt play.
  }
}

export function downloadPlaytestData() {
  if (typeof window === "undefined") return;
  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    samples: readSamples(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mandelguessr-playtest-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
