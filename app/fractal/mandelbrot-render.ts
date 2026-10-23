import { zoomToViewportWidth } from "./camera";
import {
  MANDELBROT_MAX_ITERATIONS,
  MANDELBROT_RENDERER_SPEC_VERSION,
} from "./mandelbrot-domain";
import {
  isMandelbrotPaletteId,
  MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "./mandelbrot-palettes";
import { MandelbrotWebGLPipeline } from "./MandelbrotWebGLPipeline";

export type MandelbrotRenderParams = {
  centerRe: number;
  centerIm: number;
  zoom: number;
  width: number;
  height: number;
  paletteId: MandelbrotPaletteId;
  maxIterations: number;
};

export type MandelbrotSampleMetadata = MandelbrotRenderParams & {
  rendererVersion: typeof MANDELBROT_RENDERER_SPEC_VERSION;
  paletteVersion: string;
};

export type MandelbrotSample = {
  image: ImageData;
  metadata: MandelbrotSampleMetadata;
};

type MandelbrotRenderCanvas = HTMLCanvasElement | OffscreenCanvas;

const WEBGL_CONTEXT_OPTIONS: WebGLContextAttributes = {
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
};

/**
 * Reusable renderer for callers that need more than one image. It owns one
 * offscreen WebGL2 context while every pixel still goes through the same
 * MandelbrotWebGLPipeline as the interactive PLAY / EXPLORE canvases.
 */
export class MandelbrotImageRenderer {
  private readonly canvas: MandelbrotRenderCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly pipeline: MandelbrotWebGLPipeline;
  private disposed = false;

  constructor() {
    const target = createWebGLRenderTarget();
    this.canvas = target.canvas;
    this.gl = target.gl;
    this.pipeline = new MandelbrotWebGLPipeline(target.gl);
  }

  render(params: MandelbrotRenderParams): ImageData {
    validateMandelbrotRenderParams(params);
    if (this.disposed) {
      throw new Error("破棄済みのMandelbrotImageRendererは再利用できません。");
    }

    this.canvas.width = params.width;
    this.canvas.height = params.height;
    this.pipeline.render({
      centerRe: params.centerRe,
      centerIm: params.centerIm,
      viewportWidth: zoomToViewportWidth(params.zoom),
      pixelWidth: params.width,
      pixelHeight: params.height,
      paletteId: params.paletteId,
      maxIterations: params.maxIterations,
    });

    const readback = new Uint8Array(params.width * params.height * 4);
    this.gl.readPixels(
      0,
      0,
      params.width,
      params.height,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      readback,
    );

    return new ImageData(
      flipWebGLRows(readback, params.width, params.height),
      params.width,
      params.height,
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pipeline.dispose();
  }
}

/** Render one image without depending on React state or a displayed canvas. */
export function renderMandelbrotImage(
  params: MandelbrotRenderParams,
): ImageData {
  validateMandelbrotRenderParams(params);
  const renderer = new MandelbrotImageRenderer();
  try {
    return renderer.render(params);
  } finally {
    renderer.dispose();
  }
}

/** Render one image together with immutable, renderer-versioned conditions. */
export function generateMandelbrotSample(
  params: MandelbrotRenderParams,
): MandelbrotSample {
  validateMandelbrotRenderParams(params);
  return {
    image: renderMandelbrotImage(params),
    metadata: createMandelbrotSampleMetadata(params),
  };
}

export function createMandelbrotSampleMetadata(
  params: MandelbrotRenderParams,
): MandelbrotSampleMetadata {
  validateMandelbrotRenderParams(params);
  return {
    ...params,
    rendererVersion: MANDELBROT_RENDERER_SPEC_VERSION,
    paletteVersion: MANDELBROT_PALETTES[params.paletteId].version,
  };
}

export function validateMandelbrotRenderParams(
  params: MandelbrotRenderParams,
) {
  if (!Number.isFinite(params.centerRe) || !Number.isFinite(params.centerIm)) {
    throw new RangeError("centerRe / centerImは有限値で指定してください。");
  }
  if (!Number.isFinite(params.zoom) || params.zoom <= 0) {
    throw new RangeError("zoomは0より大きい有限値で指定してください。");
  }
  validatePositiveInteger(params.width, "width");
  validatePositiveInteger(params.height, "height");
  if (
    !Number.isInteger(params.maxIterations) ||
    params.maxIterations <= 0 ||
    params.maxIterations > MANDELBROT_MAX_ITERATIONS
  ) {
    throw new RangeError(
      `maxIterationsは1〜${MANDELBROT_MAX_ITERATIONS}の整数で指定してください。`,
    );
  }
  if (!isMandelbrotPaletteId(params.paletteId)) {
    throw new RangeError("paletteIdがMandelGuessrの既知paletteではありません。");
  }
}

function validatePositiveInteger(value: number, name: "width" | "height") {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name}は0より大きい安全な整数で指定してください。`);
  }
}

function createWebGLRenderTarget(): {
  canvas: MandelbrotRenderCanvas;
  gl: WebGL2RenderingContext;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext("webgl2", WEBGL_CONTEXT_OPTIONS);
    if (gl) return { canvas, gl };
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext("webgl2", WEBGL_CONTEXT_OPTIONS);
    if (gl) return { canvas, gl };
  }

  throw new Error("この環境では画像生成に必要なWebGL2を利用できません。");
}

function flipWebGLRows(
  readback: Uint8Array,
  width: number,
  height: number,
) {
  const pixels = new Uint8ClampedArray(readback.length);
  const rowLength = width * 4;
  for (let targetY = 0; targetY < height; targetY += 1) {
    const sourceY = height - targetY - 1;
    pixels.set(
      readback.subarray(sourceY * rowLength, (sourceY + 1) * rowLength),
      targetY * rowLength,
    );
  }
  return pixels;
}
