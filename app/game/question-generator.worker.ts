import {
  type PrototypeQuestion,
} from "./question-generator";
import type { QuestionGenerationRules } from "./game-rules";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { validateQuestionGenerationRules } from "./game-rules";
import { generateSceneQuestionBatch } from "./scene-question-generator";
import { SceneGraphicsUnavailableError } from "./scene-quality-calibration";

type GenerateRequest = {
  settings: QuestionGenerationRules;
  gameSeed: number;
  paletteId?: MandelbrotPaletteId;
};

export type GenerateResponse =
  | { ok: true; questions: PrototypeQuestion[] }
  | { ok: false; message: string; code: "graphics-unavailable" | "generation-failed" };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GenerateRequest>) => void) | null;
  postMessage: (message: GenerateResponse) => void;
};

workerScope.onmessage = async ({ data }) => {
  try {
    validateQuestionGenerationRules(data.settings);
    const batch = await generateSceneQuestionBatch({
      magnification: data.settings.magnification, count: data.settings.roundCount,
      seed: data.gameSeed, paletteId: data.paletteId,
    });
    workerScope.postMessage({
      ok: true,
      questions: batch.questions,
    });
  } catch (cause) {
    workerScope.postMessage({
      ok: false,
      code: cause instanceof SceneGraphicsUnavailableError ? "graphics-unavailable" : "generation-failed",
      message:
        cause instanceof Error ? cause.message : "問題を生成できませんでした。",
    });
  }
};
