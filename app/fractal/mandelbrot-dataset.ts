import { imageDataToPngBlob } from "./mandelbrot-export";
import {
  MandelbrotImageRenderer,
  createMandelbrotSampleMetadata,
  validateMandelbrotRenderParams,
  type MandelbrotSampleMetadata,
} from "./mandelbrot-render";
import { MANDELBROT_RENDERER_SPEC_VERSION } from "./mandelbrot-domain";
import {
  MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "./mandelbrot-palettes";

export const MANDELBROT_DATASET_VERSION = 1 as const;

export type MandelbrotDatasetPoint = {
  id: string;
  centerRe: number;
  centerIm: number;
  centerReLow?: number;
  centerImLow?: number;
  zoom: number;
  source?: Record<string, unknown>;
};

export type MandelbrotDatasetRenderConfig = {
  width: number;
  height: number;
  paletteId: MandelbrotPaletteId;
  maxIterations: number;
};

export type MandelbrotDatasetSampleMetadata = MandelbrotSampleMetadata & {
  id: string;
  source?: Record<string, unknown>;
};

export type MandelbrotDatasetSource = {
  samplingMethod: string;
  seed?: number;
  generator?: Record<string, string | number | boolean>;
};

export type MandelbrotDatasetManifest = MandelbrotDatasetRenderConfig & {
  datasetVersion: typeof MANDELBROT_DATASET_VERSION;
  count: number;
  rendererVersion: typeof MANDELBROT_RENDERER_SPEC_VERSION;
  paletteVersion: string;
  samplingMethod: string;
  generatedAt: string;
  seed?: number;
  generator?: Record<string, string | number | boolean>;
};

export type GeneratedMandelbrotDatasetSample = {
  metadata: MandelbrotDatasetSampleMetadata;
  png: Blob;
};

export type MandelbrotDatasetGenerationOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: MandelbrotDatasetProgress) => void;
};

export type MandelbrotDatasetProgress = {
  completed: number;
  total: number;
  currentId: string;
};

export class MandelbrotDatasetCancelledError extends Error {
  constructor() {
    super("Dataset生成はキャンセルされました。");
    this.name = "MandelbrotDatasetCancelledError";
  }
}

export class MandelbrotDatasetSampleError extends Error {
  readonly sampleId: string;
  readonly sampleIndex: number;
  readonly cause: unknown;

  constructor(sampleId: string, sampleIndex: number, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`sample ${sampleId} (#${sampleIndex + 1}) の生成に失敗しました: ${detail}`);
    this.name = "MandelbrotDatasetSampleError";
    this.sampleId = sampleId;
    this.sampleIndex = sampleIndex;
    this.cause = cause;
  }
}

export function createMandelbrotDatasetManifest(
  points: readonly MandelbrotDatasetPoint[],
  config: MandelbrotDatasetRenderConfig,
  source: MandelbrotDatasetSource,
  generatedAt = new Date(),
): MandelbrotDatasetManifest {
  validateMandelbrotDatasetInput(points, config);
  if (source.samplingMethod.trim().length === 0) {
    throw new Error("samplingMethodは空文字にできません。");
  }
  return {
    datasetVersion: MANDELBROT_DATASET_VERSION,
    count: points.length,
    ...config,
    rendererVersion: MANDELBROT_RENDERER_SPEC_VERSION,
    paletteVersion: MANDELBROT_PALETTES[config.paletteId].version,
    samplingMethod: source.samplingMethod,
    generatedAt: generatedAt.toISOString(),
    ...(source.seed === undefined ? {} : { seed: source.seed }),
    ...(source.generator === undefined ? {} : { generator: source.generator }),
  };
}

/**
 * Renders a stream of dataset samples with one reusable WebGL renderer.
 * Sampling and filesystem concerns intentionally remain outside this module.
 */
export async function* generateMandelbrotDatasetSamples(
  points: readonly MandelbrotDatasetPoint[],
  config: MandelbrotDatasetRenderConfig,
  options: MandelbrotDatasetGenerationOptions = {},
): AsyncGenerator<GeneratedMandelbrotDatasetSample> {
  validateMandelbrotDatasetInput(points, config);
  const renderer = new MandelbrotImageRenderer();

  try {
    for (let index = 0; index < points.length; index += 1) {
      throwIfDatasetCancelled(options.signal);
      const point = points[index];
      try {
        const params = {
          centerRe: point.centerRe,
          centerIm: point.centerIm,
          ...(point.centerReLow !== undefined ? {centerReLow:point.centerReLow} : {}),
          ...(point.centerImLow !== undefined ? {centerImLow:point.centerImLow} : {}),
          zoom: point.zoom,
          ...config,
        };
        const image = renderer.render(params);
        const png = await imageDataToPngBlob(image);
        throwIfDatasetCancelled(options.signal);
        yield {
          metadata: {
            id: point.id,
            ...createMandelbrotSampleMetadata(params),
            ...(point.source ? { source: point.source } : {}),
          },
          png,
        };
        options.onProgress?.({
          completed: index + 1,
          total: points.length,
          currentId: point.id,
        });
      } catch (cause) {
        if (isMandelbrotDatasetCancellation(cause)) throw cause;
        throw new MandelbrotDatasetSampleError(point.id, index, cause);
      }
    }
  } finally {
    renderer.dispose();
  }
}

export function validateMandelbrotDatasetInput(
  points: readonly MandelbrotDatasetPoint[],
  config: MandelbrotDatasetRenderConfig,
) {
  if (points.length === 0) {
    throw new Error("Datasetには1件以上のpointが必要です。");
  }

  const ids = new Set<string>();
  for (const point of points) {
    if (!isSafeDatasetId(point.id)) {
      throw new Error(
        `Dataset id ${JSON.stringify(point.id)} は英数字・._-のみで指定してください。`,
      );
    }
    if (ids.has(point.id)) {
      throw new Error(`Dataset id ${point.id} が重複しています。`);
    }
    ids.add(point.id);
    validateMandelbrotRenderParams({
      centerRe: point.centerRe,
      centerIm: point.centerIm,
          ...(point.centerReLow !== undefined ? {centerReLow:point.centerReLow} : {}),
          ...(point.centerImLow !== undefined ? {centerImLow:point.centerImLow} : {}),
      zoom: point.zoom,
      ...config,
    });
  }
}

export function isMandelbrotDatasetCancellation(cause: unknown) {
  return cause instanceof MandelbrotDatasetCancelledError ||
    (cause instanceof DOMException && cause.name === "AbortError");
}

function isSafeDatasetId(id: string) {
  return id !== "." && id !== ".." && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}

function throwIfDatasetCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new MandelbrotDatasetCancelledError();
}
