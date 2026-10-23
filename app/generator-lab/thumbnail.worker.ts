import { viewportWidthToZoom } from "../fractal/camera";
import {
  MandelbrotImageRenderer,
  type MandelbrotRenderParams,
} from "../fractal/mandelbrot-render";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import type { Camera } from "../fractal/types";

export type ThumbnailRequest = {
  requestId: number;
  camera: Camera;
  width: number;
  height: number;
  paletteId: MandelbrotPaletteId;
  maxIterations: number;
};

export type ThumbnailResponse = {
  requestId: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ThumbnailRequest>) => void) | null;
  postMessage: (message: ThumbnailResponse, transfer: Transferable[]) => void;
};

let renderer: MandelbrotImageRenderer | null = null;

workerScope.onmessage = ({ data }) => {
  renderer ??= new MandelbrotImageRenderer();
  const params: MandelbrotRenderParams = {
    centerRe: data.camera.centerRe,
    centerIm: data.camera.centerIm,
    zoom: viewportWidthToZoom(data.camera.viewportWidth),
    width: data.width,
    height: data.height,
    paletteId: data.paletteId,
    maxIterations: data.maxIterations,
  };
  const image = renderer.render(params);

  workerScope.postMessage(
    {
      requestId: data.requestId,
      width: image.width,
      height: image.height,
      pixels: image.data,
    },
    [image.data.buffer],
  );
};
