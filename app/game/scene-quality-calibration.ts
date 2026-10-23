import { MANDELBROT_VIEW_ASPECT_RATIO, fullQualityIterationsForZoom } from "../fractal/mandelbrot-domain";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { MandelbrotImageRenderer } from "../fractal/mandelbrot-render";
import type { Camera } from "../fractal/types";
import { calibrateSceneThreshold, sceneColorVariance, type CalibrationMeasurement } from "./scene-quality";

export const SCENE_CALIBRATION_VERSION = "dataset-b1-visible-frame-v1";
// Reuse the Lab's 192px preview budget, with the actual game aspect and full
// iteration schedule. Resolution is a resource setting, not a scene weighting.
export const SCENE_ANALYSIS_WIDTH = 192;
export const SCENE_ANALYSIS_HEIGHT = Math.round(SCENE_ANALYSIS_WIDTH / MANDELBROT_VIEW_ASPECT_RATIO);

/** Source: dataset_b1 metadata IDs, inspected 2026-10-12. These references
 * calibrate visibility only; no question is sampled from these coordinates.
 * Re-rendered with game geometry/iterations and the requested palette.
 */
export const SCENE_CALIBRATION_EXAMPLES = [
  { id: "000039", label: "near-flat", centerRe: -1.7228540571406485, centerIm: 0.03169595362851396, zoom: 100 },
  { id: "000368", label: "near-flat", centerRe: -0.13458910528570422, centerIm: -1.1091811730875634, zoom: 100 },
  { id: "000166", label: "near-flat", centerRe: 0.334891887754202, centerIm: 0.6398912110598758, zoom: 100 },
  { id: "000290", label: "visible", centerRe: 0.35162501549348235, centerIm: -0.5427996860817075, zoom: 100 },
  { id: "000367", label: "visible", centerRe: -0.8286258549429477, centerIm: -0.20004843809874728, zoom: 100 },
] as const;

export type SceneAnalyzer = {
  threshold: number;
  paletteId: MandelbrotPaletteId;
  measurements: CalibrationMeasurement[];
  measure: (camera: Camera, magnification: number) => number;
  dispose: () => void;
};

export class SceneGraphicsUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "SceneGraphicsUnavailableError"; }
}

export function createSceneAnalyzer(paletteId: MandelbrotPaletteId): SceneAnalyzer {
  let renderer: MandelbrotImageRenderer;
  try { renderer = new MandelbrotImageRenderer(); }
  catch (cause) { throw new SceneGraphicsUnavailableError(cause instanceof Error ? cause.message : "景観を確認するWebGL2を開始できませんでした。"); }
  const renderEnergy = (centerRe: number, centerIm: number, zoom: number) => sceneColorVariance(renderer.render({
    centerRe, centerIm, zoom, width: SCENE_ANALYSIS_WIDTH, height: SCENE_ANALYSIS_HEIGHT,
    paletteId, maxIterations: fullQualityIterationsForZoom(zoom),
  }));
  try {
    const measurements = SCENE_CALIBRATION_EXAMPLES.map((sample) => ({
      id: sample.id, label: sample.label, energy: renderEnergy(sample.centerRe, sample.centerIm, sample.zoom),
    }));
    return {
      threshold: calibrateSceneThreshold(measurements), paletteId, measurements,
      measure: (camera, magnification) => renderEnergy(camera.centerRe, camera.centerIm, magnification),
      dispose: () => renderer.dispose(),
    };
  } catch (cause) { renderer.dispose(); throw cause; }
}
