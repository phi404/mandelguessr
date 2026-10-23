import type {
  MandelbrotDatasetPoint,
  MandelbrotDatasetSource,
} from "../fractal/mandelbrot-dataset";
import type {
  LabGeneratorSettings,
  LabQuestion,
} from "./generator-lab";

export function labQuestionsToDatasetPoints(
  questions: readonly LabQuestion[],
): MandelbrotDatasetPoint[] {
  return questions.map((question, index) => ({
    id: String(index).padStart(6, "0"),
    centerRe: question.camera.centerRe,
    centerIm: question.camera.centerIm,
    zoom: question.magnification,
    ...(question.debug.kind === "distance-visible" ? {
      source: { questionId: question.id, ...question.debug.generation },
    } : {}),
  }));
}

export function generatorLabDatasetSource(
  settings: LabGeneratorSettings,
  questions?: readonly LabQuestion[],
): MandelbrotDatasetSource {
  const first = questions?.[0];
  const generation = first?.debug.kind === "distance-visible" ? first.debug.generation : null;
  return {
    samplingMethod: "generator-lab",
    seed: settings.seed >>> 0,
    generator: {
      algorithm: settings.algorithm,
      magnification: settings.magnification,
      boundaryResolution: settings.boundaryResolution,
      ...(generation ? {
        generatorVersion: generation.version,
        qualityMetricVersion: generation.quality.metricVersion,
        calibrationVersion: generation.quality.calibrationVersion,
        qualityThreshold: generation.quality.threshold,
        analysisWidth: generation.quality.width,
        analysisHeight: generation.quality.height,
        analysisPaletteId: generation.quality.paletteId,
        analysisMaxIterations: generation.quality.maxIterations,
      } : {}),
    },
  };
}
