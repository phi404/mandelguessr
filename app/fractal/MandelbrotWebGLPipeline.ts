import {
  fastFragmentShaderSource,
  preciseFragmentShaderSource,
  vertexShaderSource,
} from "./mandelbrot-shaders";
import { viewportHeight, viewportWidthToZoom } from "./camera";
import {
  DEFAULT_MANDELBROT_PALETTE_ID,
  MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "./mandelbrot-palettes";

export const MANDELBROT_PRECISE_RENDER_ZOOM = 300;

export type MandelbrotPipelineRenderParams = {
  centerRe: number;
  centerIm: number;
  viewportWidth: number;
  pixelWidth: number;
  pixelHeight: number;
  paletteId: MandelbrotPaletteId;
  maxIterations: number;
};

export type MandelbrotPipelineRenderResult = {
  precision: "float32" | "double-single";
};

type FastPipeline = {
  program: WebGLProgram;
  center: WebGLUniformLocation;
  viewSize: WebGLUniformLocation;
  maxIterations: WebGLUniformLocation;
  palette: WebGLUniformLocation;
  paletteSize: WebGLUniformLocation;
};

type PrecisePipeline = {
  program: WebGLProgram;
  centerHigh: WebGLUniformLocation;
  centerLow: WebGLUniformLocation;
  viewSize: WebGLUniformLocation;
  maxIterations: WebGLUniformLocation;
  palette: WebGLUniformLocation;
  paletteSize: WebGLUniformLocation;
};

/**
 * The shared pixel renderer used by the interactive canvas and the image API.
 * All escape, smooth-color, transfer, palette, precision, and sampling behavior
 * remains in the same GLSL programs regardless of the caller.
 */
export class MandelbrotWebGLPipeline {
  private readonly gl: WebGL2RenderingContext;
  private readonly fastPipeline: FastPipeline;
  private readonly precisePipeline: PrecisePipeline;
  private readonly paletteTexture: WebGLTexture;
  private paletteId: MandelbrotPaletteId | null = null;
  private paletteSize = 0;

  constructor(
    gl: WebGL2RenderingContext,
    initialPaletteId: MandelbrotPaletteId = DEFAULT_MANDELBROT_PALETTE_ID,
  ) {
    this.gl = gl;
    this.fastPipeline = this.createFastPipeline();
    this.precisePipeline = this.createPrecisePipeline();
    const paletteTexture = gl.createTexture();
    if (!paletteTexture) {
      throw new Error("パレット用WebGLテクスチャを作成できませんでした。");
    }
    this.paletteTexture = paletteTexture;
    this.uploadPalette(initialPaletteId);
  }

  render(
    params: MandelbrotPipelineRenderParams,
  ): MandelbrotPipelineRenderResult {
    const { gl } = this;
    if (gl.isContextLost()) {
      throw new Error("Mandelbrot描画中にWebGLコンテキストが失われました。");
    }

    if (params.paletteId !== this.paletteId) {
      this.uploadPalette(params.paletteId);
    }

    const zoom = viewportWidthToZoom(params.viewportWidth);
    const currentViewportHeight = viewportHeight(params.viewportWidth, {
      width: params.pixelWidth,
      height: params.pixelHeight,
    });
    const usePrecisePipeline = zoom >= MANDELBROT_PRECISE_RENDER_ZOOM;

    gl.viewport(0, 0, params.pixelWidth, params.pixelHeight);

    if (usePrecisePipeline) {
      const centerRe = splitFloat64(params.centerRe);
      const centerIm = splitFloat64(params.centerIm);
      const pipeline = this.precisePipeline;

      gl.useProgram(pipeline.program);
      this.bindPalette(pipeline);
      gl.uniform2f(pipeline.centerHigh, centerRe[0], centerIm[0]);
      gl.uniform2f(pipeline.centerLow, centerRe[1], centerIm[1]);
      gl.uniform2f(
        pipeline.viewSize,
        params.viewportWidth,
        currentViewportHeight,
      );
      gl.uniform1i(pipeline.maxIterations, params.maxIterations);
    } else {
      const pipeline = this.fastPipeline;

      gl.useProgram(pipeline.program);
      this.bindPalette(pipeline);
      gl.uniform2f(pipeline.center, params.centerRe, params.centerIm);
      gl.uniform2f(
        pipeline.viewSize,
        params.viewportWidth,
        currentViewportHeight,
      );
      gl.uniform1i(pipeline.maxIterations, params.maxIterations);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return {
      precision: usePrecisePipeline ? "double-single" : "float32",
    };
  }

  dispose() {
    this.gl.deleteProgram(this.fastPipeline.program);
    this.gl.deleteProgram(this.precisePipeline.program);
    this.gl.deleteTexture(this.paletteTexture);
  }

  private createFastPipeline(): FastPipeline {
    const program = this.createProgram(fastFragmentShaderSource);
    return {
      program,
      center: this.requireUniform(program, "u_center"),
      viewSize: this.requireUniform(program, "u_viewSize"),
      maxIterations: this.requireUniform(program, "u_maxIterations"),
      palette: this.requireUniform(program, "u_palette"),
      paletteSize: this.requireUniform(program, "u_paletteSize"),
    };
  }

  private createPrecisePipeline(): PrecisePipeline {
    const program = this.createProgram(preciseFragmentShaderSource);
    return {
      program,
      centerHigh: this.requireUniform(program, "u_centerHigh"),
      centerLow: this.requireUniform(program, "u_centerLow"),
      viewSize: this.requireUniform(program, "u_viewSize"),
      maxIterations: this.requireUniform(program, "u_maxIterations"),
      palette: this.requireUniform(program, "u_palette"),
      paletteSize: this.requireUniform(program, "u_paletteSize"),
    };
  }

  private uploadPalette(paletteId: MandelbrotPaletteId) {
    const { gl } = this;
    const lut = MANDELBROT_PALETTES[paletteId].lut;
    this.paletteId = paletteId;
    this.paletteSize = lut.length / 3;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // RGB8 deliberately avoids automatic sRGB decoding. Canonical palette
    // bytes and interpolation stay in their original display-encoded space.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB8,
      this.paletteSize,
      1,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      lut,
    );
  }

  private bindPalette(pipeline: FastPipeline | PrecisePipeline) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.uniform1i(pipeline.palette, 0);
    gl.uniform1f(pipeline.paletteSize, this.paletteSize);
  }

  private createProgram(fragmentSource: string) {
    const vertexShader = this.compileShader(
      this.gl.VERTEX_SHADER,
      vertexShaderSource,
    );
    const fragmentShader = this.compileShader(
      this.gl.FRAGMENT_SHADER,
      fragmentSource,
    );
    const program = this.gl.createProgram();

    if (!program) {
      throw new Error("WebGLプログラムを作成できませんでした。");
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "unknown link error";
      this.gl.deleteProgram(program);
      throw new Error(`WebGLプログラムのリンクに失敗しました: ${log}`);
    }

    return program;
  }

  private compileShader(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error("WebGLシェーダーを作成できませんでした。");
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader) ?? "unknown compile error";
      this.gl.deleteShader(shader);
      throw new Error(`WebGLシェーダーのコンパイルに失敗しました: ${log}`);
    }

    return shader;
  }

  private requireUniform(program: WebGLProgram, name: string) {
    const location = this.gl.getUniformLocation(program, name);
    if (location === null) {
      throw new Error(`WebGL uniform ${name} が見つかりません。`);
    }
    return location;
  }
}

function splitFloat64(value: number): [number, number] {
  const high = Math.fround(value);
  const low = Math.fround(value - high);
  return [high, low];
}
