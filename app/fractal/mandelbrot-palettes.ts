import {
  CLASSIC_V2_LUT,
  MANDELBROT_PALETTE_SHA256,
  MONOCHROME_CET_C5_LUT,
  RETRO_V1_LUT,
  SCIENTIFIC_ROMAO_8_0_1_LUT,
  SPECTRUM_CET_C6_LUT,
} from "./mandelbrot-palette-data";

export const MANDELBROT_PALETTE_IDS = [
  "classic",
  "retro",
  "scientific",
  "monochrome",
  "spectrum",
] as const;

export type MandelbrotPaletteId = typeof MANDELBROT_PALETTE_IDS[number];
export const DEFAULT_MANDELBROT_PALETTE_ID: MandelbrotPaletteId = "classic";

export type MandelbrotPalette = {
  id: MandelbrotPaletteId;
  label: string;
  version: string;
  source: string;
  license: string;
  lut: Uint8Array;
  sha256: string;
};

export const MANDELBROT_PALETTES: Record<MandelbrotPaletteId, MandelbrotPalette> = {
  classic: {
    id: "classic",
    label: "Classic",
    version: "classic-v2-upr-serialized-phase",
    source: "Wolfgang Beyer, Mandel zoom 00 Mandelbrot set, Ultra Fractal 3 UPR",
    license: "CC BY-SA 3.0 / GFDL (reference image and UPR)",
    lut: CLASSIC_V2_LUT,
    sha256: MANDELBROT_PALETTE_SHA256.CLASSIC_V2_LUT,
  },
  retro: {
    id: "retro",
    label: "Retro",
    version: "fractint-default-map-32-55-v1",
    source: "Fractint 20.4.10 default.map entries 32-55",
    license: "Fractint distribution notice; see palettes/ATTRIBUTION.md",
    lut: RETRO_V1_LUT,
    sha256: MANDELBROT_PALETTE_SHA256.RETRO_V1_LUT,
  },
  scientific: {
    id: "scientific",
    label: "Scientific",
    version: "scientific-colour-maps-8.0.1-romao",
    source: "Fabio Crameri, Scientific Colour Maps 8.0.1, romaO",
    license: "MIT",
    lut: SCIENTIFIC_ROMAO_8_0_1_LUT,
    sha256: MANDELBROT_PALETTE_SHA256.SCIENTIFIC_ROMAO_8_0_1_LUT,
  },
  monochrome: {
    id: "monochrome",
    label: "Monochrome",
    version: "colorcet-cet-c5-v1",
    source: "Peter Kovesi, ColorCET CET-C5",
    license: "CC BY 4.0",
    lut: MONOCHROME_CET_C5_LUT,
    sha256: MANDELBROT_PALETTE_SHA256.MONOCHROME_CET_C5_LUT,
  },
  spectrum: {
    id: "spectrum",
    label: "Spectrum",
    version: "colorcet-cet-c6-v1",
    source: "Peter Kovesi, ColorCET CET-C6",
    license: "CC BY 4.0",
    lut: SPECTRUM_CET_C6_LUT,
    sha256: MANDELBROT_PALETTE_SHA256.SPECTRUM_CET_C6_LUT,
  },
};

export function isMandelbrotPaletteId(value: unknown): value is MandelbrotPaletteId {
  return typeof value === "string" && MANDELBROT_PALETTE_IDS.includes(value as MandelbrotPaletteId);
}

export function samplePaletteRgb(paletteId: MandelbrotPaletteId, t: number) {
  const lut = MANDELBROT_PALETTES[paletteId].lut;
  const length = lut.length / 3;
  // Color mapping owns cyclic normalization. This reference sampler accepts
  // only that normalized [0, 1) position and must not re-wrap negative input.
  const normalized = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1 - Number.EPSILON) : 0;
  const position = normalized * length;
  const left = Math.floor(position) % length;
  const mixAmount = position - Math.floor(position);
  const right = (left + 1) % length;
  return [0, 1, 2].map((channel) => Math.round(
    lut[left * 3 + channel] * (1 - mixAmount) +
    lut[right * 3 + channel] * mixAmount,
  )) as [number, number, number];
}
