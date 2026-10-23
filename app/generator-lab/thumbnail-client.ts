import type { Camera } from "../fractal/types";
import {
  DEFAULT_MANDELBROT_PALETTE_ID,
  type MandelbrotPaletteId,
} from "../fractal/mandelbrot-palettes";
import { iterationsForMagnification } from "../game/question-generator";
import type { ThumbnailResponse } from "./thumbnail.worker";
import ThumbnailWorker from "./thumbnail.worker.ts?worker";

const THUMBNAIL_WIDTH = 192;
const THUMBNAIL_HEIGHT = 120;

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve: (value: ThumbnailResponse) => void; reject: (cause: Error) => void }
>();

function sharedWorker() {
  if (worker) return worker;
  worker = new ThumbnailWorker();
  worker.addEventListener("message", (event: MessageEvent<ThumbnailResponse>) => {
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    request.resolve(event.data);
  });
  worker.addEventListener("error", () => {
    for (const request of pending.values()) {
      request.reject(new Error("Thumbnail workerで描画できませんでした。"));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function renderQuestionThumbnail(
  camera: Camera,
  magnification: number,
  paletteId: MandelbrotPaletteId = DEFAULT_MANDELBROT_PALETTE_ID,
): Promise<ThumbnailResponse> {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    sharedWorker().postMessage({
      requestId,
      camera,
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      paletteId,
      // Calibration, gallery and game evaluate the same full-quality orbit.
      maxIterations: iterationsForMagnification(magnification),
    });
  });
}
