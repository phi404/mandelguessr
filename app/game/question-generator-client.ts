import {
  type PrototypeQuestion,
} from "./question-generator";
import type { QuestionGenerationRules } from "./game-rules";
import type { GenerateResponse } from "./question-generator.worker";
import QuestionGeneratorWorker from "./question-generator.worker.ts?worker";
import { validateQuestionGenerationRules } from "./game-rules";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { generateSceneQuestionBatch } from "./scene-question-generator";

// The request includes full-quality image readback as well as CPU geometry.
const WORKER_TIMEOUT_MS = 30_000;

export function generateRoundQuestions(
  settings: QuestionGenerationRules,
  gameSeed: number,
  options: { paletteId?: MandelbrotPaletteId; signal?: AbortSignal } = {},
): Promise<PrototypeQuestion[]> {
  if (options.signal?.aborted) return Promise.reject(new DOMException("生成はキャンセルされました。", "AbortError"));
  validateQuestionGenerationRules(settings);
  const fallback = (signal = options.signal) => generateSceneQuestionBatch({
    magnification: settings.magnification, count: settings.roundCount,
    seed: gameSeed, paletteId: options.paletteId,
  }, { signal }).then((batch) => batch.questions);
  if (typeof Worker === "undefined") {
    return fallback();
  }

  return new Promise((resolve, reject) => {
    const worker = new QuestionGeneratorWorker();
    const controller = new AbortController();
    let settled = false;
    let fallbackStarted = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      controller.abort();
      finish();
      reject(new Error("問題の生成に時間がかかりすぎています。"));
    }, WORKER_TIMEOUT_MS);

    const finish = () => {
      settled = true;
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };

    const handleAbort = () => {
      controller.abort();
      finish();
      reject(new DOMException("生成はキャンセルされました。", "AbortError"));
    };
    const runFallback = () => {
      if (settled || fallbackStarted) return;
      fallbackStarted = true;
      worker.terminate();
      void fallback(controller.signal).then((questions) => {
        if (!settled) { finish(); resolve(questions); }
      }, (cause: unknown) => {
        if (!settled) { finish(); reject(cause); }
      });
    };

    worker.addEventListener("message", (event: MessageEvent<GenerateResponse>) => {
      if (settled || fallbackStarted) return;
      if (!event.data.ok && event.data.code === "graphics-unavailable") { runFallback(); return; }
      finish();
      if (event.data.ok) resolve(event.data.questions);
      else reject(new Error(event.data.message));
    });
    worker.addEventListener("error", () => {
      runFallback();
    });
    options.signal?.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage({ settings, gameSeed, paletteId: options.paletteId });
  });
}
