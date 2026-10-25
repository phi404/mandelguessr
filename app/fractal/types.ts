import type { MANDELBROT_RENDERER_SPEC_VERSION } from "./mandelbrot-domain";
import type { MandelbrotPaletteId } from "./mandelbrot-palettes";

export type Camera = {
  centerRe: number;
  centerIm: number;
  centerReLow?: number;
  centerImLow?: number;
  viewportWidth: number;
};

export type ViewSnapshot = Camera & {
  zoom: number;
  iterations: number;
  pixelWidth: number;
  pixelHeight: number;
  precision: "float32" | "double-single" | "perturbation";
  quality: "interactive" | "preview" | "full";
  rendererSpecVersion: typeof MANDELBROT_RENDERER_SPEC_VERSION;
  paletteId: MandelbrotPaletteId;
  paletteVersion: string;
};

export type ComplexCoordinate = {
  re: number;
  im: number;
  reLow?: number;
  imLow?: number;
};

export type ViewportInteraction = {
  pan: boolean;
  zoom: boolean;
  select: boolean;
};

export type ZoomLimits = {
  min: number;
  max: number;
};
