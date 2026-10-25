import {
  fastFragmentShaderSource,
  preciseFragmentShaderSource,
  vertexShaderSource,
} from "./mandelbrot-shaders";
import { viewportHeight, viewportWidthToZoom } from "./camera";
import { iterationShaderSource } from "./progressive-shaders";
import { buildReferenceOrbit, shouldUsePerturbation, referenceOffset, REFERENCE_TEXTURE_WIDTH, type ReferenceOrbit } from "./reference-orbit";
import {
  DEFAULT_MANDELBROT_PALETTE_ID,
  MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "./mandelbrot-palettes";

export const MANDELBROT_PRECISE_RENDER_ZOOM = 100;

export function shouldUseCompensatedArithmetic(zoom: number) {
  return zoom >= MANDELBROT_PRECISE_RENDER_ZOOM * (1 - 8 * Number.EPSILON);
}

export type MandelbrotPipelineRenderParams = {
  centerRe: number;
  centerIm: number;
  centerReLow?: number;
  centerImLow?: number;
  viewportWidth: number;
  pixelWidth: number;
  pixelHeight: number;
  paletteId: MandelbrotPaletteId;
  maxIterations: number;
};

export type MandelbrotPipelineRenderResult = {
  precision: "float32" | "double-single" | "perturbation";
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
  viewSizeLow: WebGLUniformLocation;
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
  private perturbProgram: WebGLProgram | null = null;
  private referenceTexture: WebGLTexture | null = null;
  private reference: ReferenceOrbit | null = null;
  private readonly approximationTextures: WebGLTexture[] = [];
  private approximation: ReferenceOrbit["bla"] = undefined;

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
    const usePrecisePipeline = shouldUseCompensatedArithmetic(zoom);

    gl.viewport(0, 0, params.pixelWidth, params.pixelHeight);

    if (shouldUsePerturbation(zoom)) {
      const camera = { ...params };
      if (!this.reference || this.reference.camera.centerRe !== params.centerRe ||
          this.reference.camera.centerIm !== params.centerIm ||
          this.reference.camera.centerReLow !== params.centerReLow ||
          this.reference.camera.centerImLow !== params.centerImLow || this.reference.maxIterations < params.maxIterations || params.viewportWidth < this.reference.camera.viewportWidth/8 ||
          (params.viewportWidth<1e-12 && !this.reference.bla)) {
        this.reference = buildReferenceOrbit(camera, params.maxIterations);
        this.referenceTexture ??= gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.referenceTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, REFERENCE_TEXTURE_WIDTH,
          this.reference.data.length / (4 * REFERENCE_TEXTURE_WIDTH), 0, gl.RGBA, gl.FLOAT, this.reference.data);
      }
      this.perturbProgram ??= this.createProgram(iterationShaderSource(false));
      const program = this.perturbProgram;
      gl.useProgram(program);
      this.bindSharedPalette(program, params.paletteId);
      const uniform = (name: string) => gl.getUniformLocation(program, name);
      const offset = referenceOffset(camera, this.reference.camera);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.referenceTexture);
      gl.uniform1i(uniform("u_reference"), 3);
      gl.uniform1i(uniform("u_referenceLength"), this.reference.length);
      gl.uniform2f(uniform("u_referenceOffset"), ...offset);
      gl.uniform2f(uniform("u_referenceOffsetLow"),offset[0]-Math.fround(offset[0]),offset[1]-Math.fround(offset[1]));
      gl.uniform2f(uniform("u_centerHigh"), params.centerRe, params.centerIm);
      gl.uniform2f(uniform("u_centerLow"), 0, 0);
      const pixelStep=params.viewportWidth/params.pixelWidth;
      gl.uniform2f(uniform("u_pixelStep"),pixelStep,pixelStep-Math.fround(pixelStep));
      gl.uniform2f(uniform("u_outputSize"), params.pixelWidth, params.pixelHeight);
      gl.uniform2f(uniform("u_tileOrigin"), 0, 0);
      gl.uniform1i(uniform("u_completed"), 0);
      gl.uniform1i(uniform("u_steps"), params.maxIterations);
      gl.uniform1i(uniform("u_perturb"), 1);
      this.bindApproximation(program,this.reference,params);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return { precision: "perturbation" };
    }

    if (usePrecisePipeline) {
      const centerRe = splitFloat64(params.centerRe, params.centerReLow);
      const centerIm = splitFloat64(params.centerIm, params.centerImLow);
      const pipeline = this.precisePipeline;

      gl.useProgram(pipeline.program);
      this.bindPalette(pipeline);
      gl.uniform2f(pipeline.centerHigh, centerRe[0], centerIm[0]);
      gl.uniform2f(pipeline.centerLow, centerRe[1], centerIm[1]);
      gl.uniform2f(pipeline.viewSizeLow, params.viewportWidth-Math.fround(params.viewportWidth), currentViewportHeight-Math.fround(currentViewportHeight));
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
    this.gl.deleteTexture(this.referenceTexture);
    this.gl.deleteProgram(this.perturbProgram);
    this.approximationTextures.forEach(texture=>this.gl.deleteTexture(texture));
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
      viewSizeLow: this.requireUniform(program, "u_viewSizeLow"),
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

  createProgram(fragmentSource: string) {
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

    this.gl.useProgram(program);
    const roundMask = this.gl.getUniformLocation(program, "u_roundMask");
    if (roundMask !== null) this.gl.uniform1ui(roundMask, 0xffffffff);
    return program;
  }

  bindSharedPalette(program: WebGLProgram, paletteId: MandelbrotPaletteId) {
    if (paletteId !== this.paletteId) this.uploadPalette(paletteId);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.paletteTexture);
    this.gl.uniform1i(this.gl.getUniformLocation(program, "u_palette"), 0);
    this.gl.uniform1f(this.gl.getUniformLocation(program, "u_paletteSize"), this.paletteSize);
  }

  bindApproximation(program: WebGLProgram, reference: ReferenceOrbit | null, params: MandelbrotPipelineRenderParams) {
    const { gl }=this;
    const names=["u_blaHigh","u_blaLow","u_blaBounds"];
    const bla=reference?.bla;
    for(let index=0;index<3;index++) {
      gl.activeTexture(gl.TEXTURE5+index);
      if(!this.approximationTextures[index]) {
        const texture=gl.createTexture();
        if(!texture)throw new Error("Could not create approximation texture.");
        this.approximationTextures.push(texture);
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,new Float32Array(4));
      }
      gl.bindTexture(gl.TEXTURE_2D,this.approximationTextures[index]);
      if(bla && bla!==this.approximation) {
        const data=[bla.high,bla.low,bla.bounds][index];
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1024,data.length/(4*1024),0,gl.RGBA,gl.FLOAT,data);
      }
      gl.uniform1i(gl.getUniformLocation(program,names[index]),5+index);
    }
    if(bla)this.approximation=bla;
    const offset=reference ? referenceOffset(params,reference.camera) : [0,0];
    const delta=Math.hypot(...offset)+0.5*Math.hypot(params.viewportWidth,params.viewportWidth*params.pixelHeight/params.pixelWidth);
    gl.uniform1i(gl.getUniformLocation(program,"u_blaEnabled"),bla && delta<0.99*bla.maxDelta ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program,"u_blaStride"),bla?.stride ?? 1);
  }

  async createProgramAsync(fragmentSource: string) {
    const { gl }=this;
    const vertex=this.compileShader(gl.VERTEX_SHADER,vertexShaderSource,false);
    const fragment=this.compileShader(gl.FRAGMENT_SHADER,fragmentSource,false);
    const program=gl.createProgram();
    if(!program)throw new Error("Could not create render program.");
    gl.attachShader(program,vertex);
    gl.attachShader(program,fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    const parallel=gl.getExtension("KHR_parallel_shader_compile");
    if(parallel) {
      gl.flush();
      while(!gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR)) {
        await new Promise<void>(resolve=>setTimeout(resolve,8));
        if(gl.isContextLost()) {gl.deleteProgram(program);throw new Error("WebGL context lost.");}
      }
    }
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) {
      const message=gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Could not compile render program: ${message}`);
    }
    gl.useProgram(program);
    const mask=gl.getUniformLocation(program,"u_roundMask");
    if(mask!==null)gl.uniform1ui(mask,0xffffffff);
    return program;
  }

  private compileShader(type: number, source: string, validate=true) {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error("WebGLシェーダーを作成できませんでした。");
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (validate && !this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
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

function splitFloat64(value: number, extra = 0): [number, number] {
  const high = Math.fround(value);
  const low = Math.fround(value - high + extra);
  return [high, low];
}
