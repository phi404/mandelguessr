import {
  type LabGenerationResult,
  type LabGeneratorSettings,
} from "./generator-lab";
import type { LabGenerateResponse } from "./generator-lab.worker";
import GeneratorLabWorker from "./generator-lab.worker.ts?worker";
import { generateLabQuestionBatch } from "./scene-lab";

const LAB_WORKER_TIMEOUT_MS = 120_000;

export function generateLabQuestionsAsync(
  settings: LabGeneratorSettings,
  signal?: AbortSignal,
): Promise<LabGenerationResult> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("生成はキャンセルされました。", "AbortError"));
  }
  if (typeof Worker === "undefined") {
    return generateLabQuestionBatch(settings, signal);
  }

  return new Promise((resolve, reject) => {
    const worker = new GeneratorLabWorker();
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("生成が2分を超えたため中止しました。COUNTか倍率を下げてください。"));
    }, LAB_WORKER_TIMEOUT_MS);

    const finish = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };

    const handleAbort = () => {
      finish();
      reject(new DOMException("生成はキャンセルされました。", "AbortError"));
    };

    worker.addEventListener("message", (event: MessageEvent<LabGenerateResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else if (event.data.code === "graphics-unavailable") {
        void generateLabQuestionBatch(settings, signal).then(resolve, reject);
      }
      else reject(new Error(event.data.message));
    });
    worker.addEventListener("error", () => {
      finish();
      reject(new Error("Generator Lab workerを開始できませんでした。"));
    });
    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage(settings);
  });
}
