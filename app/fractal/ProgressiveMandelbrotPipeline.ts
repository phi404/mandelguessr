import { viewportHeight } from "./camera";
import { MandelbrotWebGLPipeline, type MandelbrotPipelineRenderParams } from "./MandelbrotWebGLPipeline";
import { displayShaderSource, iterationShaderSource, resolveShaderSource } from "./progressive-shaders";
import { referenceOffset, REFERENCE_TEXTURE_WIDTH, type ReferenceOrbit } from "./reference-orbit";
import { samplePaletteRgb } from "./mandelbrot-palettes";
import { MANDELBROT_COLOR_DENSITY, MANDELBROT_POWER, MANDELBROT_SMOOTH_BAILOUT, MANDELBROT_SMOOTH_INDEX_SCALE } from "./mandelbrot-domain";
import type { Camera } from "./types";

const TILE_SIZE = 64;
type Target = { framebuffer: WebGLFramebuffer; textures: WebGLTexture[] };
type Tile = { x: number; y: number; width: number; height: number; completed: number; read: number };
export type RepairPixel = { x: number; y: number; offsetRe: number; offsetIm: number };

/** Bounded tile storage; only one tile's iteration state lives on the GPU. */
export class ProgressiveMandelbrotPipeline {
  private readonly display: WebGLProgram;
  private iterate!: WebGLProgram;
  private resolve: WebGLProgram | null = null;
  readonly ready: Promise<void>;
  private disposed = false;
  private readonly resumable: boolean;
  private readonly state: Target[] = [];
  private readonly referenceTexture: WebGLTexture;
  private readonly locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private image: Target | null = null;
  private imageCamera: Camera | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private params: MandelbrotPipelineRenderParams | null = null;
  private reference: ReferenceOrbit | null = null;
  private uploadedReference: ReferenceOrbit | null = null;
  private tiles: Tile[] = [];
  private tileIndex = 0;
  private fence: WebGLSync | null = null;
  private readonly metaPixels = new Float32Array(TILE_SIZE * TILE_SIZE * 4);
  private repairs: RepairPixel[] = [];

  constructor(private readonly gl: WebGL2RenderingContext, private readonly shared: MandelbrotWebGLPipeline) {
    this.display = shared.createProgram(displayShaderSource);
    this.resumable = Boolean(gl.getExtension("EXT_color_buffer_float"));
    this.ready = Promise.all([
      shared.createProgramAsync(iterationShaderSource(this.resumable)),
      this.resumable ? shared.createProgramAsync(resolveShaderSource) : Promise.resolve(null),
    ]).then(([iterate,resolve])=>{
      this.iterate=iterate;
      this.resolve=resolve;
      if(this.disposed) {gl.deleteProgram(iterate);gl.deleteProgram(resolve);}
    });
    this.referenceTexture = this.texture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.referenceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
    if (this.resumable) {
      this.state.push(this.target(TILE_SIZE, TILE_SIZE, true), this.target(TILE_SIZE, TILE_SIZE, true));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  begin(params: MandelbrotPipelineRenderParams, reference: ReferenceOrbit | null) {
    this.cancel();
    this.params = { ...params };
    this.reference = reference;
    this.repairs = [];
    const previous = this.image, previousCamera = this.imageCamera;
    this.image = this.target(params.pixelWidth, params.pixelHeight, false);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.image.framebuffer);
    this.gl.viewport(0, 0, params.pixelWidth, params.pixelHeight);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    if (previous && previousCamera) this.drawImage(previous.textures[0], params, previousCamera);
    if (previous) this.deleteTarget(previous);
    this.imageCamera = { ...params };
    this.imageWidth = params.pixelWidth;
    this.imageHeight = params.pixelHeight;
    this.tiles = [];
    const size = this.resumable ? TILE_SIZE : 32;
    for (let y = 0; y < params.pixelHeight; y += size) for (let x = 0; x < params.pixelWidth; x += size) {
      this.tiles.push({ x, y, width: Math.min(size, params.pixelWidth-x), height: Math.min(size, params.pixelHeight-y), completed: 0, read: 0 });
    }
    this.tiles.sort((a,b) => Math.hypot(a.x+a.width/2-params.pixelWidth/2,a.y+a.height/2-params.pixelHeight/2)
      - Math.hypot(b.x+b.width/2-params.pixelWidth/2,b.y+b.height/2-params.pixelHeight/2));
    this.tileIndex = 0;
    this.uploadReference();
    this.present(params);
  }

  /** Reproject the last image immediately while a new CPU reference is pending. */
  present(camera: Camera) {
    if (!this.image || !this.imageCamera) return;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.drawImage(this.image.textures[0], camera, this.imageCamera);
  }

  /** At most eight small GPU batches are queued before yielding to input. */
  step(): boolean {
    const { gl, params } = this;
    if (!params || !this.image) return true;
    if (this.fence) {
      const status = gl.clientWaitSync(this.fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(this.fence);
      this.fence = null;
    }
    const started=performance.now();
    for (let batch = 0; batch < 8 && this.tileIndex < this.tiles.length && (batch===0 || performance.now()-started<6); batch++) {
      const tile = this.tiles[this.tileIndex];
      if (this.resumable) this.advanceTile(tile);
      else this.drawFallbackTile(tile);
    }
    this.present(params);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return this.tileIndex >= this.tiles.length;
  }

  takeRepairs() { const pixels = this.repairs; this.repairs = []; return pixels; }

  applyRepairs(pixels: RepairPixel[], values: { iteration: number; magnitudeSquared: number }[]) {
    if (!this.image || !this.params) return;
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.image.textures[0]);
    pixels.forEach((pixel, index) => {
      const value = values[index];
      let rgb = [0,0,0];
      if (value.iteration > 0) {
        const smooth = MANDELBROT_SMOOTH_INDEX_SCALE * (value.iteration +
          (Math.log(Math.log(MANDELBROT_SMOOTH_BAILOUT))-Math.log(Math.log(Math.sqrt(value.magnitudeSquared)))) / Math.log(MANDELBROT_POWER));
        const transferred = Math.log1p(MANDELBROT_COLOR_DENSITY * smooth);
        rgb = samplePaletteRgb(this.params!.paletteId, transferred > 0 ? transferred-Math.floor(transferred) : 0);
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, pixel.x, pixel.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([...rgb,255]));
    });
    this.present(this.params);
  }

  cancel() {
    if (this.fence) this.gl.deleteSync(this.fence);
    this.fence = null;
    this.params = null;
  }

  dispose() {
    this.disposed = true;
    this.cancel();
    this.state.forEach(target => this.deleteTarget(target));
    if (this.image) this.deleteTarget(this.image);
    this.gl.deleteTexture(this.referenceTexture);
    this.gl.deleteProgram(this.display);
    if(this.iterate)this.gl.deleteProgram(this.iterate);
    this.gl.deleteProgram(this.resolve);
  }

  private advanceTile(tile: Tile) {
    const { gl, params } = this;
    if (!params || !this.resolve || !this.image) return;
    const write = 1-tile.read;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state[write].framebuffer);
    gl.viewport(0,0,tile.width,tile.height);
    gl.useProgram(this.iterate);
    this.bindIterationUniforms(tile, Math.min(1024, params.maxIterations-tile.completed));
    this.bindTexture(this.iterate, "u_state", this.state[tile.read].textures[0], 1);
    this.bindTexture(this.iterate, "u_meta", this.state[tile.read].textures[1], 2);
    gl.uniform1i(this.location(this.iterate,"u_initial"), tile.completed === 0 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    tile.completed = Math.min(params.maxIterations, tile.completed+1024);
    tile.read = write;
    let finished = tile.completed >= params.maxIterations;
    if (finished || tile.completed === 1024 || tile.completed % 4096 === 0) {
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(0,0,tile.width,tile.height,gl.RGBA,gl.FLOAT,this.metaPixels);
      let active = false;
      for (let index=0;index<tile.width*tile.height;index++) {
        if (this.metaPixels[index*4+1] === 0 && this.metaPixels[index*4+3] === 0) { active=true; break; }
      }
      finished ||= !active;
      if (finished) for (let index=0;index<tile.width*tile.height;index++) {
        if (this.metaPixels[index*4+3] === 1) this.addRepair(tile.x+index%tile.width, tile.y+Math.floor(index/tile.width));
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.image.framebuffer);
    gl.viewport(tile.x,tile.y,tile.width,tile.height);
    gl.useProgram(this.resolve);
    this.shared.bindSharedPalette(this.resolve,params.paletteId);
    this.bindTexture(this.resolve,"u_meta",this.state[write].textures[1],2);
    gl.uniform2f(this.location(this.resolve,"u_tileOrigin"),tile.x,tile.y);
    gl.uniform1i(this.location(this.resolve,"u_final"),finished ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (finished) this.tileIndex++;
  }

  /** Float render targets are optional in WebGL2; small full-iteration tiles remain usable. */
  private drawFallbackTile(tile: Tile) {
    const { gl, params } = this;
    if (!params || !this.image) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.image.framebuffer);
    gl.viewport(0,0,params.pixelWidth,params.pixelHeight);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(tile.x,tile.y,tile.width,tile.height);
    gl.useProgram(this.iterate);
    this.bindIterationUniforms({ ...tile,x:0,y:0 }, params.maxIterations);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disable(gl.SCISSOR_TEST);
    const pixels = new Uint8Array(tile.width*tile.height*4);
    gl.readPixels(tile.x,tile.y,tile.width,tile.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    for(let index=0;index<tile.width*tile.height;index++) if(pixels[index*4+3]===0) this.addRepair(tile.x+index%tile.width,tile.y+Math.floor(index/tile.width));
    this.tileIndex++;
  }

  private addRepair(x: number,y: number) {
    const params=this.params!;
    this.repairs.push({x,y,offsetRe:((x+0.5)/params.pixelWidth-0.5)*params.viewportWidth,
      offsetIm:((y+0.5)/params.pixelHeight-0.5)*viewportHeight(params.viewportWidth,{width:params.pixelWidth,height:params.pixelHeight})});
  }

  private bindIterationUniforms(tile: Tile,steps: number) {
    const { gl, params } = this;
    if(!params)return;
    const program=this.iterate;
    this.shared.bindSharedPalette(program,params.paletteId);
    this.shared.bindApproximation(program,this.reference,params);
    this.bindTexture(program,"u_reference",this.referenceTexture,3);
    gl.uniform1i(this.location(program,"u_perturb"),this.reference ? 1 : 0);
    gl.uniform1i(this.location(program,"u_referenceLength"),this.reference?.length ?? 1);
    const refOffset=this.reference ? referenceOffset(params,this.reference.camera) : [0,0] as const;
    gl.uniform2f(this.location(program,"u_referenceOffset"),...refOffset);
    gl.uniform2f(this.location(program,"u_referenceOffsetLow"),refOffset[0]-Math.fround(refOffset[0]),refOffset[1]-Math.fround(refOffset[1]));
    const highRe=Math.fround(params.centerRe), highIm=Math.fround(params.centerIm);
    gl.uniform2f(this.location(program,"u_centerHigh"),highRe,highIm);
    gl.uniform2f(this.location(program,"u_centerLow"),params.centerRe-highRe+(params.centerReLow ?? 0),params.centerIm-highIm+(params.centerImLow ?? 0));
    const pixelStep=params.viewportWidth/params.pixelWidth;
    gl.uniform2f(this.location(program,"u_pixelStep"),pixelStep,pixelStep-Math.fround(pixelStep));
    gl.uniform2f(this.location(program,"u_outputSize"),params.pixelWidth,params.pixelHeight);
    gl.uniform2f(this.location(program,"u_tileOrigin"),tile.x,tile.y);
    gl.uniform1i(this.location(program,"u_completed"),tile.completed);
    gl.uniform1i(this.location(program,"u_steps"),steps);
  }

  private uploadReference() {
    if (!this.reference || this.reference === this.uploadedReference) return;
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D,this.referenceTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,REFERENCE_TEXTURE_WIDTH,this.reference.data.length/(4*REFERENCE_TEXTURE_WIDTH),0,gl.RGBA,gl.FLOAT,this.reference.data);
    this.uploadedReference=this.reference;
  }

  private drawImage(texture: WebGLTexture,camera: Camera,source: Camera) {
    const { gl }=this;
    gl.useProgram(this.display);
    this.bindTexture(this.display,"u_image",texture,4);
    const offset=referenceOffset(camera,source);
    gl.uniform2f(this.location(this.display,"u_offset"),offset[0]/source.viewportWidth,
      offset[1]/(source.viewportWidth*this.imageHeight/Math.max(this.imageWidth,1)));
    const scale=camera.viewportWidth/source.viewportWidth;
    gl.uniform2f(this.location(this.display,"u_scale"),scale,scale*(gl.drawingBufferHeight/gl.drawingBufferWidth)/(this.imageHeight/Math.max(this.imageWidth,1)));
    gl.drawArrays(gl.TRIANGLES,0,3);
  }

  private texture() {
    const texture=this.gl.createTexture();
    if(!texture)throw new Error("Could not create render texture.");
    this.gl.bindTexture(this.gl.TEXTURE_2D,texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MIN_FILTER,this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_MAG_FILTER,this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_S,this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D,this.gl.TEXTURE_WRAP_T,this.gl.CLAMP_TO_EDGE);
    return texture;
  }

  private target(width:number,height:number,state:boolean): Target {
    const { gl }=this;
    const framebuffer=gl.createFramebuffer();
    if(!framebuffer)throw new Error("Could not create framebuffer.");
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    const textures=[];
    for(let index=0;index<(state ? 2 : 1);index++) {
      const texture=this.texture();
      gl.texImage2D(gl.TEXTURE_2D,0,state ? gl.RGBA32F : gl.RGBA8,width,height,0,gl.RGBA,state ? gl.FLOAT : gl.UNSIGNED_BYTE,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+index,gl.TEXTURE_2D,texture,0);
      textures.push(texture);
    }
    gl.drawBuffers(textures.map((_,index)=>gl.COLOR_ATTACHMENT0+index));
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error("Render framebuffer is incomplete.");
    return {framebuffer,textures};
  }

  private deleteTarget(target: Target) {
    target.textures.forEach(texture=>this.gl.deleteTexture(texture));
    this.gl.deleteFramebuffer(target.framebuffer);
  }

  private bindTexture(program:WebGLProgram,name:string,texture:WebGLTexture,unit:number) {
    this.gl.activeTexture(this.gl.TEXTURE0+unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D,texture);
    this.gl.uniform1i(this.location(program,name),unit);
  }

  private location(program:WebGLProgram,name:string) {
    let locations=this.locations.get(program);
    if(!locations) {locations=new Map();this.locations.set(program,locations);}
    if(!locations.has(name))locations.set(name,this.gl.getUniformLocation(program,name));
    return locations.get(name)!;
  }
}
