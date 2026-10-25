import type { Camera } from "./types";
import { ddAdd, ddMultiply, ddNumber, ddSubtract, type DoubleDouble } from "./double-double";
import { buildBilinearApproximation, type BilinearApproximation } from "./bilinear-approximation";

export const PERTURBATION_ZOOM = 10_000;

export function shouldUsePerturbation(zoom: number) {
  // A width/zoom round trip must not select the expensive path at exactly 10,000.
  return zoom > PERTURBATION_ZOOM * (1 + 8 * Number.EPSILON);
}
export const REFERENCE_TEXTURE_WIDTH = 1024;

export type ReferenceOrbit = {
  camera: Camera;
  maxIterations: number;
  length: number;
  data: Float32Array;
  bla?: BilinearApproximation;
};

/** One CPU double-double orbit; GPU pixel deltas never add to an absolute c. */
class OrbitBuilder {
  private re: DoubleDouble = [0, 0];
  private im: DoubleDouble = [0, 0];
  private readonly cRe: DoubleDouble;
  private readonly cIm: DoubleDouble;
  private readonly result: ReferenceOrbit;
  private done = false;

  constructor(camera: Camera, maxIterations: number) {
    this.cRe = [camera.centerRe, camera.centerReLow ?? 0];
    this.cIm = [camera.centerIm, camera.centerImLow ?? 0];
    this.result = { camera: { ...camera }, maxIterations, length: 1,
      data: new Float32Array(Math.ceil((maxIterations + 1) / REFERENCE_TEXTURE_WIDTH) * REFERENCE_TEXTURE_WIDTH * 4) };
  }

  advance(steps: number) {
    for (let step = 0; step < steps && !this.done; step++) {
      const xy = ddMultiply(this.re, this.im);
      this.re = ddAdd(ddSubtract(ddMultiply(this.re, this.re), ddMultiply(this.im, this.im)), this.cRe);
      this.im = ddAdd(ddAdd(xy, xy), this.cIm);
      const offset = this.result.length * 4;
      const re = ddNumber(this.re), im = ddNumber(this.im);
      const highRe=Math.fround(re), highIm=Math.fround(im);
      this.result.data[offset]=highRe;
      this.result.data[offset+1]=highIm;
      this.result.data[offset+2]=ddNumber(ddSubtract(this.re,[highRe,0]));
      this.result.data[offset+3]=ddNumber(ddSubtract(this.im,[highIm,0]));
      this.result.length++;
      this.done = re * re + im * im > 10000 || this.result.length > this.result.maxIterations;
    }
    return this.done;
  }

  finish() {
    if (this.result.camera.viewportWidth < 1e-12) {
      this.result.bla = buildBilinearApproximation(this.result.data,this.result.length,this.result.camera.viewportWidth);
    }
    return this.result;
  }
}

export function buildReferenceOrbit(camera: Camera, maxIterations: number): ReferenceOrbit {
  const builder = new OrbitBuilder(camera, maxIterations);
  builder.advance(maxIterations);
  return builder.finish();
}

export async function buildReferenceOrbitAsync(camera: Camera, maxIterations: number, cancelled: () => boolean) {
  const builder = new OrbitBuilder(camera, maxIterations);
  while (!builder.advance(512)) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (cancelled()) throw new DOMException("Cancelled", "AbortError");
  }
  if (cancelled()) throw new DOMException("Cancelled", "AbortError");
  return builder.finish();
}

export function referenceOffset(camera: Camera, reference: Camera) {
  return [
    ddNumber(ddSubtract([camera.centerRe, camera.centerReLow ?? 0], [reference.centerRe, reference.centerReLow ?? 0])),
    ddNumber(ddSubtract([camera.centerIm, camera.centerImLow ?? 0], [reference.centerIm, reference.centerImLow ?? 0])),
  ] as const;
}

/** Used only for pixels rejected by the GPU's perturbation error check. */
export function repairOrbit(camera: Camera, offsetRe: number, offsetIm: number, maxIterations: number) {
  const cRe = ddAdd([camera.centerRe, camera.centerReLow ?? 0], [offsetRe, 0]);
  const cIm = ddAdd([camera.centerIm, camera.centerImLow ?? 0], [offsetIm, 0]);
  if(cIm[0]===0 && cIm[1]===0 && (cRe[0]>-2 || (cRe[0]===-2 && cRe[1]>=0)) &&
      (cRe[0]<0.25 || (cRe[0]===0.25 && cRe[1]<=0))) return {iteration:0,magnitudeSquared:0};
  let re: DoubleDouble = [0, 0], im: DoubleDouble = [0, 0];
  for (let index = 1; index <= maxIterations; index++) {
    const xy = ddMultiply(re, im);
    re = ddAdd(ddSubtract(ddMultiply(re, re), ddMultiply(im, im)), cRe);
    im = ddAdd(ddAdd(xy, xy), cIm);
    const magnitudeSquared = ddNumber(re) ** 2 + ddNumber(im) ** 2;
    if (magnitudeSquared > 10000) return { iteration: index, magnitudeSquared };
  }
  return { iteration: 0, magnitudeSquared: 0 };
}
