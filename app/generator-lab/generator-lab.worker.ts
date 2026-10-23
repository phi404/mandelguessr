import {
  type LabGenerationResult,
  type LabGeneratorSettings,
} from "./generator-lab";
import { generateLabQuestionBatch } from "./scene-lab";
import { SceneGraphicsUnavailableError } from "../game/scene-quality-calibration";

export type LabGenerateResponse =
  | { ok: true; result: LabGenerationResult }
  | { ok: false; message: string; code?: "graphics-unavailable" };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LabGeneratorSettings>) => void) | null;
  postMessage: (message: LabGenerateResponse) => void;
};

workerScope.onmessage = async ({ data }) => {
  try {
    workerScope.postMessage({ ok: true, result: await generateLabQuestionBatch(data) });
  } catch (cause) {
    workerScope.postMessage({
      ok: false,
      code: cause instanceof SceneGraphicsUnavailableError ? "graphics-unavailable" : undefined,
      message:
        cause instanceof Error ? cause.message : "Labの問題を生成できませんでした。",
    });
  }
};
