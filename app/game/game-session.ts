import type { ComplexCoordinate } from "../fractal/types";
import { DEFAULT_GAME_RULES, type GameRules } from "./game-rules";
import type { PrototypeQuestion } from "./question-generator";
import type { GuessScore } from "./score-guess";

export type GamePhase =
  | "home"
  | "new-game"
  | "creating"
  | "creation-error"
  | "explore"
  | "play"
  | "round-result"
  | "final-result";

export type GameOverlay = "menu" | "information" | "settings";

export type RoundRecord = {
  question: PrototypeQuestion;
  guess: ComplexCoordinate;
  score: GuessScore;
};

export type CreationRequest = {
  rules: GameRules;
  seed: number;
  persistRules: boolean;
};

export type GameSessionState = {
  phase: GamePhase;
  gameRules: GameRules;
  questions: PrototypeQuestion[];
  records: RoundRecord[];
  roundIndex: number;
  guess: ComplexCoordinate | null;
  generationError: string | null;
  gameSeed: number | null;
  sessionId: string;
  pendingCreation: CreationRequest | null;
  overlay: GameOverlay | null;
  roundPaused: boolean;
};

export type GameSessionAction =
  | { type: "SHOW_SETUP"; phase: "new-game" | "explore" }
  | { type: "SET_RULES"; rules: GameRules }
  | { type: "START_GENERATION"; request: CreationRequest }
  | {
      type: "GENERATION_SUCCEEDED";
      request: CreationRequest;
      questions: PrototypeQuestion[];
      sessionId: string;
    }
  | { type: "GENERATION_FAILED"; message: string }
  | { type: "SET_GUESS"; guess: ComplexCoordinate | null }
  | { type: "SUBMIT_GUESS"; record: RoundRecord }
  | { type: "CONTINUE" }
  | { type: "NAVIGATE"; phase: "home" | "new-game" | "explore" }
  | { type: "OPEN_OVERLAY"; overlay: GameOverlay }
  | { type: "CLOSE_OVERLAY" };

export function createInitialGameSession(
  sessionId: string,
  gameRules: GameRules = DEFAULT_GAME_RULES,
): GameSessionState {
  return {
    phase: "home",
    gameRules,
    questions: [],
    records: [],
    roundIndex: 0,
    guess: null,
    generationError: null,
    gameSeed: null,
    sessionId,
    pendingCreation: null,
    overlay: null,
    roundPaused: false,
  };
}

export function gameSessionReducer(
  state: GameSessionState,
  action: GameSessionAction,
): GameSessionState {
  switch (action.type) {
    case "SHOW_SETUP":
      return { ...state, phase: action.phase };
    case "SET_RULES":
      return { ...state, gameRules: action.rules };
    case "START_GENERATION":
      return {
        ...state,
        phase: "creating",
        generationError: null,
        pendingCreation: action.request,
        overlay: null,
        roundPaused: false,
      };
    case "GENERATION_SUCCEEDED":
      return {
        ...state,
        phase: "play",
        gameRules: action.request.rules,
        questions: action.questions,
        records: [],
        roundIndex: 0,
        guess: null,
        generationError: null,
        gameSeed: action.request.seed,
        sessionId: action.sessionId,
        pendingCreation: action.request,
        overlay: null,
        roundPaused: false,
      };
    case "GENERATION_FAILED":
      return {
        ...state,
        phase: "creation-error",
        generationError: action.message,
        overlay: null,
        roundPaused: false,
      };
    case "SET_GUESS":
      if (state.phase !== "play") return state;
      return { ...state, guess: action.guess };
    case "SUBMIT_GUESS":
      if (state.phase !== "play") return state;
      return {
        ...state,
        phase: "round-result",
        records: [...state.records, action.record],
        roundPaused: false,
      };
    case "CONTINUE":
      if (state.phase !== "round-result") return state;
      if (state.roundIndex === state.questions.length - 1) {
        return { ...state, phase: "final-result", roundPaused: false };
      }
      return {
        ...state,
        phase: "play",
        roundIndex: state.roundIndex + 1,
        guess: null,
        roundPaused: false,
      };
    case "NAVIGATE":
      return {
        ...state,
        phase: action.phase,
        questions: [],
        records: [],
        guess: null,
        gameSeed: null,
        overlay: null,
        roundPaused: false,
      };
    case "OPEN_OVERLAY":
      return {
        ...state,
        overlay: action.overlay,
        roundPaused: state.phase === "play",
      };
    case "CLOSE_OVERLAY":
      return { ...state, overlay: null, roundPaused: false };
  }
}
