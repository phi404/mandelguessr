import {
  MANDELBROT_RENDERER_SPEC_VERSION, fullQualityIterationsForZoom,
} from "../fractal/mandelbrot-domain";
import {
  DEFAULT_MANDELBROT_PALETTE_ID, isMandelbrotPaletteId, MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "../fractal/mandelbrot-palettes";
import { isValidMagnification } from "./game-rules";
import { MAX_CELL_DRAWS, QUESTION_GENERATOR_VERSION, type PrototypeQuestion } from "./question-generator";
import { createSceneCandidateSampler } from "./scene-candidates";
import { hasVisibleScene, SCENE_QUALITY_METRIC_VERSION, type CalibrationMeasurement } from "./scene-quality";
import {
  createSceneAnalyzer, SCENE_ANALYSIS_WIDTH, SCENE_ANALYSIS_HEIGHT, SCENE_CALIBRATION_VERSION,
  type SceneAnalyzer,
} from "./scene-quality-calibration";

export type SceneGenerationSettings = { magnification: number; count: number; seed: number; paletteId?: MandelbrotPaletteId };
export type SceneGenerationStats = {
  candidatesTested: number; projectionRejected: number; qualityRejected: number;
  accepted: number; generationTimeMs: number; threshold: number;
  calibration: CalibrationMeasurement[];
};
export type SceneGenerationResult = { questions: PrototypeQuestion[]; stats: SceneGenerationStats };
export type SceneGenerationOptions = {
  signal?: AbortSignal;
  maxProposals?: number;
  analyzerFactory?: (paletteId: MandelbrotPaletteId) => SceneAnalyzer;
};

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("生成はキャンセルされました。", "AbortError");
}

/** Independent rejection sampling. Neither previous questions nor their
 * features enter a candidate's eligibility or probability.
 */
export async function generateSceneQuestionBatch(
  settings: SceneGenerationSettings,
  options: SceneGenerationOptions = {},
): Promise<SceneGenerationResult> {
  const { magnification, count, seed } = settings;
  const paletteId = settings.paletteId ?? DEFAULT_MANDELBROT_PALETTE_ID;
  const maxProposals = options.maxProposals ?? MAX_CELL_DRAWS;
  if (!isValidMagnification(magnification) || !Number.isInteger(count) || count < 1 ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !isMandelbrotPaletteId(paletteId) ||
      !Number.isInteger(maxProposals) || maxProposals < 1) throw new Error("景観生成の倍率・件数・seed・描画設定が不正です。");
  checkAbort(options.signal);
  const startedAt = performance.now();
  const analyzer = (options.analyzerFactory ?? createSceneAnalyzer)(paletteId);
  const nextCandidate = createSceneCandidateSampler(magnification, seed, SCENE_ANALYSIS_WIDTH, SCENE_ANALYSIS_HEIGHT);
  const questions: PrototypeQuestion[] = [];
  let tested = 0, projectionRejected = 0, qualityRejected = 0;
  // Main-thread fallback remains interruptible; timing never changes selection.
  const frameBudgetMs = 1000 / 60;
  let nextYield = performance.now() + frameBudgetMs;
  try {
    for (; tested < maxProposals && questions.length < count; tested += 1) {
      checkAbort(options.signal);
      const candidate = nextCandidate();
      if (!candidate) projectionRejected += 1;
      else {
        const energy = analyzer.measure(candidate.camera, magnification);
        if (!hasVisibleScene(energy, analyzer.threshold)) qualityRejected += 1;
        else questions.push({
          id: `${seed}-scene-${magnification}-${candidate.proposalIndex}`,
          camera: candidate.camera, magnification,
          generation: {
            version: QUESTION_GENERATOR_VERSION, proposalIndex: candidate.proposalIndex,
            anchor: candidate.anchor, representative: candidate.representative,
            projectionSteps: candidate.projectionSteps,
            quality: {
              energy, threshold: analyzer.threshold, metricVersion: SCENE_QUALITY_METRIC_VERSION,
              calibrationVersion: SCENE_CALIBRATION_VERSION,
              width: SCENE_ANALYSIS_WIDTH, height: SCENE_ANALYSIS_HEIGHT, paletteId,
              maxIterations: fullQualityIterationsForZoom(magnification),
              rendererVersion: MANDELBROT_RENDERER_SPEC_VERSION,
              paletteVersion: MANDELBROT_PALETTES[paletteId].version,
            },
          },
        });
      }
      if (performance.now() >= nextYield) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        checkAbort(options.signal);
        nextYield = performance.now() + frameBudgetMs;
      }
    }
    checkAbort(options.signal);
    if (questions.length < count) throw new Error("模様が見える問題を十分に生成できませんでした。単色判定を維持したまま生成を終了しました。");
    return { questions, stats: { candidatesTested: tested, projectionRejected, qualityRejected,
      accepted: questions.length, generationTimeMs: performance.now() - startedAt,
      threshold: analyzer.threshold, calibration: analyzer.measurements } };
  } finally { analyzer.dispose(); }
}
