import { questionViewportGeometry } from "../fractal/mandelbrot-domain";
import { generateSceneQuestionBatch } from "../game/scene-question-generator";
import {
  generateLabQuestions, validateLabSettings,
  type LabGeneratorSettings, type LabGenerationResult, type LabQuestion,
} from "./generator-lab";

export async function generateLabQuestionBatch(settings: LabGeneratorSettings, signal?: AbortSignal): Promise<LabGenerationResult> {
  if (signal?.aborted) throw new DOMException("生成はキャンセルされました。", "AbortError");
  validateLabSettings(settings);
  if (settings.algorithm !== "distance-visible") return generateLabQuestions(settings);
  const batch = await generateSceneQuestionBatch({
    magnification: settings.magnification, count: settings.count, seed: settings.seed, paletteId: settings.paletteId,
  }, { signal });
  const viewport = questionViewportGeometry(settings.magnification);
  const questions = batch.questions.map<LabQuestion>((question, index) => {
    if (!question.generation) throw new Error("景観の生成情報がありません。");
    return {
      id: question.id, index, camera: question.camera, magnification: question.magnification,
      algorithm: "distance-visible", seed: settings.seed,
      debug: {
        kind: "distance-visible", generation: question.generation,
        viewport: {
          left: question.camera.centerRe - viewport.width / 2, right: question.camera.centerRe + viewport.width / 2,
          bottom: question.camera.centerIm - viewport.height / 2, top: question.camera.centerIm + viewport.height / 2,
        },
      },
    };
  });
  return {
    settings, questions,
    stats: {
      generated: questions.length, candidatesTested: batch.stats.candidatesTested,
      accepted: questions.length, rejected: batch.stats.projectionRejected + batch.stats.qualityRejected,
      generationTimeMs: batch.stats.generationTimeMs,
      detail: `${batch.stats.projectionRejected} projection rejects · ${batch.stats.qualityRejected} near-flat image rejects · independent draws`,
      scene: {
        projectionRejected: batch.stats.projectionRejected, qualityRejected: batch.stats.qualityRejected,
        threshold: batch.stats.threshold, calibration: batch.stats.calibration,
      },
    },
  };
}
