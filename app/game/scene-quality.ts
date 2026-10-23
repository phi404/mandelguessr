/** RGB in the renderer's display-encoded space; alpha is not a landscape cue. */
export const SCENE_QUALITY_METRIC_VERSION = "rgb-population-variance-v1";

export type ScenePixels = { width: number; height: number; data: ArrayLike<number> };

/** Mean squared RGB distance from the image's mean color. Unlike edge energy,
 * this retains a large clear two-region boundary as well as fine landscapes.
 */
export function sceneColorVariance(image: ScenePixels): number {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error("景観判定画像の寸法または画素数が不正です。");
  }
  const mean = [0, 0, 0];
  const squaredDeviation = [0, 0, 0];
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    count += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[index + channel] / 255;
      const delta = value - mean[channel];
      mean[channel] += delta / count;
      squaredDeviation[channel] += delta * (value - mean[channel]);
    }
  }
  return squaredDeviation.reduce((sum, value) => sum + value, 0) / count;
}

export function neighborColorEnergy(image: ScenePixels): number {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error("景観判定画像の寸法または画素数が不正です。");
  }
  let energy = 0;
  let pairs = 0;
  const addPair = (first: number, second: number) => {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = (data[first + channel] - data[second + channel]) / 255;
      energy += difference * difference;
    }
    pairs += 1;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (x + 1 < width) addPair(index, index + 4);
      if (y + 1 < height) addPair(index, index + width * 4);
    }
  }
  return pairs === 0 ? 0 : energy / pairs;
}

export type CalibrationMeasurement = { id: string; label: "near-flat" | "visible"; energy: number };

/** The threshold is the largest measured near-flat reference, not a magic cutoff. */
export function calibrateSceneThreshold(measurements: CalibrationMeasurement[]): number {
  if (measurements.some((m) => !Number.isFinite(m.energy) || m.energy < 0)) throw new Error("景観校正値が不正です。");
  const rejected = measurements.filter((m) => m.label === "near-flat");
  const visible = measurements.filter((m) => m.label === "visible");
  if (rejected.length === 0 || visible.length === 0) throw new Error("景観校正には単色近似と可視景観の両方が必要です。");
  const threshold = Math.max(...rejected.map((m) => m.energy));
  if (visible.some((m) => m.energy <= threshold)) throw new Error("描画された校正画像で景観の可視性を区別できませんでした。");
  return threshold;
}

export function hasVisibleScene(energy: number, threshold: number): boolean {
  return Number.isFinite(energy) && Number.isFinite(threshold) && threshold >= 0 && energy > threshold;
}
