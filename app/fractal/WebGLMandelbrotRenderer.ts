import {
  fullQualityIterationsForZoom,
  MANDELBROT_RENDERER_SPEC_VERSION,
} from "./mandelbrot-domain";
import {
  DEFAULT_MANDELBROT_PALETTE_ID,
  MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "./mandelbrot-palettes";
import { MandelbrotWebGLPipeline } from "./MandelbrotWebGLPipeline";
import {
  cameraForAnchoredViewportWidth,
  clampViewportWidth,
  INITIAL_CAMERA,
  normalizeZoomLimits,
  panCameraByScreenDelta,
  screenToComplex,
  viewportWidthToZoom,
  zoomToViewportWidth,
} from "./camera";
import type {
  Camera,
  ComplexCoordinate,
  ViewSnapshot,
  ViewportInteraction,
  ZoomLimits,
} from "./types";

export { INITIAL_CAMERA } from "./camera";
export type {
  Camera,
  ComplexCoordinate,
  ViewSnapshot,
  ViewportInteraction,
  ZoomLimits,
} from "./types";

export type RendererOptions = {
  initialCamera?: Camera;
  interaction?: ViewportInteraction;
  zoomLimits?: ZoomLimits;
  onViewChange?: (snapshot: ViewSnapshot) => void;
  onSelect?: (coordinate: ComplexCoordinate) => void;
  paletteId?: MandelbrotPaletteId;
};

const MAX_DEVICE_PIXEL_RATIO = 3;
const INTERACTIVE_RESOLUTION_SCALE = 0.42;
const PREVIEW_RESOLUTION_SCALE = 0.72;
const INTERACTIVE_PIXEL_BUDGET = 1_100_000;
const PREVIEW_PIXEL_BUDGET = 2_600_000;
const FULL_PIXEL_BUDGET = 5_500_000;
const PREVIEW_DELAY_MS = 70;
const FULL_DELAY_MS = 240;

type RenderQuality = "interactive" | "preview" | "full";

export class WebGLMandelbrotRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly pipeline: MandelbrotWebGLPipeline;
  private readonly resizeObserver: ResizeObserver;
  private readonly initialCamera: Camera;
  private readonly interaction: ViewportInteraction;
  private readonly zoomLimits: ZoomLimits;
  private readonly onViewChange?: (snapshot: ViewSnapshot) => void;
  private readonly onSelect?: (coordinate: ComplexCoordinate) => void;

  private camera: Camera;
  private frameRequest: number | null = null;
  private previewTimer: number | null = null;
  private fullTimer: number | null = null;
  private requestedQuality: RenderQuality = "full";
  private activePointerId: number | null = null;
  private previousPointer = { x: 0, y: 0 };
  private pointerStart = { x: 0, y: 0 };
  private pointerHasDragged = false;
  private gestureWasMultiTouch = false;
  private readonly pointerPositions = new Map<number, { x: number; y: number }>();
  private paletteId: MandelbrotPaletteId;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.zoomLimits = normalizeZoomLimits(options.zoomLimits);
    this.initialCamera = {
      ...(options.initialCamera ?? INITIAL_CAMERA),
      viewportWidth: clampViewportWidth(
        (options.initialCamera ?? INITIAL_CAMERA).viewportWidth,
        this.zoomLimits,
      ),
    };
    this.camera = { ...this.initialCamera };
    this.interaction = options.interaction ?? {
      pan: true,
      zoom: true,
      select: true,
    };
    this.onViewChange = options.onViewChange;
    this.onSelect = options.onSelect;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      throw new Error("この環境ではWebGL2を利用できません。");
    }

    this.gl = gl;
    this.paletteId = options.paletteId ?? DEFAULT_MANDELBROT_PALETTE_ID;
    this.pipeline = new MandelbrotWebGLPipeline(gl, this.paletteId);

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(canvas);
    this.bindEvents();
    this.beginRefinedRender();
  }

  reset() {
    this.camera = { ...this.initialCamera };
    this.beginRefinedRender();
  }

  focus(centerRe: number, centerIm: number, zoom: number) {
    const requestedWidth = zoomToViewportWidth(zoom);
    this.camera = {
      centerRe,
      centerIm,
      viewportWidth: clampViewportWidth(requestedWidth, this.zoomLimits),
    };
    this.beginRefinedRender();
  }

  setPalette(paletteId: MandelbrotPaletteId) {
    if (paletteId === this.paletteId) return;
    this.paletteId = paletteId;
    this.beginRefinedRender();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.clearRefinementTimers();

    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
    }

    this.pipeline.dispose();
  }

  private bindEvents() {
    if (this.interaction.pan || this.interaction.zoom || this.interaction.select) {
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    }
    if (this.interaction.zoom) {
      this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    }
    if (this.interaction.pan || this.interaction.zoom) {
      this.canvas.addEventListener("keydown", this.handleKeyDown);
    }
  }

  private unbindEvents() {
    if (this.interaction.pan || this.interaction.zoom || this.interaction.select) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    }
    if (this.interaction.zoom) {
      this.canvas.removeEventListener("wheel", this.handleWheel);
    }
    if (this.interaction.pan || this.interaction.zoom) {
      this.canvas.removeEventListener("keydown", this.handleKeyDown);
    }
  }

  private readonly handleResize = () => {
    this.beginRefinedRender();
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    const position = { x: event.clientX, y: event.clientY };
    this.pointerPositions.set(event.pointerId, position);
    if (this.pointerPositions.size === 1) {
      this.activePointerId = event.pointerId;
      this.previousPointer = position;
      this.pointerStart = position;
      this.pointerHasDragged = false;
      this.gestureWasMultiTouch = false;
    } else {
      this.gestureWasMultiTouch = true;
      this.pointerHasDragged = true;
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.focus({ preventScroll: true });
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    const previousPosition = this.pointerPositions.get(event.pointerId);
    if (!previousPosition) return;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const previousGesture = [...this.pointerPositions.values()];
    const nextPosition = { x: event.clientX, y: event.clientY };
    this.pointerPositions.set(event.pointerId, nextPosition);

    if (this.pointerPositions.size >= 2 && this.interaction.zoom) {
      const nextGesture = [...this.pointerPositions.values()];
      const previous = gestureMetrics(previousGesture[0], previousGesture[1]);
      const next = gestureMetrics(nextGesture[0], nextGesture[1]);
      if (previous.distance <= 0 || next.distance <= 0) return;

      const nextWidth = clampViewportWidth(
        this.camera.viewportWidth * (previous.distance / next.distance),
        this.zoomLimits,
      );
      this.camera = cameraForAnchoredViewportWidth(
        this.camera,
        {
          x: previous.midpoint.x - rect.left,
          y: previous.midpoint.y - rect.top,
        },
        {
          x: next.midpoint.x - rect.left,
          y: next.midpoint.y - rect.top,
        },
        { width: rect.width, height: rect.height },
        nextWidth,
      );
      this.pointerHasDragged = true;
      this.renderInteraction();
      return;
    }

    if (event.pointerId !== this.activePointerId) return;

    const dx = event.clientX - this.previousPointer.x;
    const dy = event.clientY - this.previousPointer.y;
    if (
      Math.hypot(
        event.clientX - this.pointerStart.x,
        event.clientY - this.pointerStart.y,
      ) > 4
    ) {
      this.pointerHasDragged = true;
    }

    this.previousPointer = nextPosition;
    if (!this.interaction.pan) return;

    this.camera = panCameraByScreenDelta(
      this.camera,
      { x: dx, y: dy },
      { width: rect.width, height: rect.height },
    );
    this.renderInteraction();
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (!this.pointerPositions.has(event.pointerId)) return;

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    if (
      event.type === "pointerup" &&
      this.pointerPositions.size === 1 &&
      !this.gestureWasMultiTouch &&
      !this.pointerHasDragged &&
      this.interaction.select &&
      this.onSelect
    ) {
      this.onSelect(this.coordinateAt(event.clientX, event.clientY));
    }

    this.pointerPositions.delete(event.pointerId);
    const remainingPointer = this.pointerPositions.entries().next().value as
      | [number, { x: number; y: number }]
      | undefined;
    if (remainingPointer) {
      this.activePointerId = remainingPointer[0];
      this.previousPointer = remainingPointer[1];
      this.pointerStart = remainingPointer[1];
      this.pointerHasDragged = true;
      return;
    }

    this.activePointerId = null;
    if ((this.interaction.pan || this.interaction.zoom) && this.pointerHasDragged) {
      this.scheduleRefinement();
    }
    this.pointerHasDragged = false;
    this.gestureWasMultiTouch = false;
  };

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const previousWidth = this.camera.viewportWidth;
    const zoomFactor = Math.exp(
      Math.max(-1, Math.min(1, event.deltaY * 0.0022)),
    );
    const nextWidth = clampViewportWidth(
      previousWidth * zoomFactor,
      this.zoomLimits,
    );
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    this.camera = cameraForAnchoredViewportWidth(
      this.camera,
      anchor,
      anchor,
      { width: rect.width, height: rect.height },
      nextWidth,
    );
    this.renderInteraction();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      this.reset();
    }
  };

  private renderInteraction() {
    this.requestRender("interactive");
    this.scheduleRefinement();
  }

  private beginRefinedRender() {
    this.clearRefinementTimers();
    this.requestRender("preview");
    this.fullTimer = window.setTimeout(() => {
      this.fullTimer = null;
      this.requestRender("full");
    }, PREVIEW_DELAY_MS);
  }

  private scheduleRefinement() {
    this.clearRefinementTimers();
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.requestRender("preview");
    }, PREVIEW_DELAY_MS);
    this.fullTimer = window.setTimeout(() => {
      this.fullTimer = null;
      this.requestRender("full");
    }, FULL_DELAY_MS);
  }

  private clearRefinementTimers() {
    if (this.previewTimer !== null) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.fullTimer !== null) {
      window.clearTimeout(this.fullTimer);
      this.fullTimer = null;
    }
  }

  private requestRender(quality: RenderQuality) {
    this.requestedQuality = quality;
    if (this.frameRequest !== null) return;

    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = null;
      this.render(this.requestedQuality);
    });
  }

  private render(quality: RenderQuality) {
    const { gl, canvas } = this;
    if (gl.isContextLost()) return;

    this.resizeDrawingBuffer(quality);
    if (canvas.width <= 0 || canvas.height <= 0) return;

    const zoom = viewportWidthToZoom(this.camera.viewportWidth);
    const fullIterations = fullQualityIterationsForZoom(zoom);
    const iterations = quality === "interactive"
      ? Math.max(140, Math.min(380, Math.round(fullIterations * 0.45)))
      : quality === "preview"
        ? Math.max(320, Math.round(fullIterations * 0.74))
        : fullIterations;
    const renderResult = this.pipeline.render({
      centerRe: this.camera.centerRe,
      centerIm: this.camera.centerIm,
      viewportWidth: this.camera.viewportWidth,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      paletteId: this.paletteId,
      maxIterations: iterations,
    });

    this.onViewChange?.({
      ...this.camera,
      zoom,
      iterations,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      precision: renderResult.precision,
      quality,
      rendererSpecVersion: MANDELBROT_RENDERER_SPEC_VERSION,
      paletteId: this.paletteId,
      paletteVersion: MANDELBROT_PALETTES[this.paletteId].version,
    });
  }

  private coordinateAt(clientX: number, clientY: number): ComplexCoordinate {
    const rect = this.canvas.getBoundingClientRect();
    return screenToComplex(
      { x: clientX - rect.left, y: clientY - rect.top },
      this.camera,
      { width: rect.width, height: rect.height },
    );
  }

  private resizeDrawingBuffer(quality: RenderQuality) {
    const resolutionScale = quality === "interactive"
      ? INTERACTIVE_RESOLUTION_SCALE
      : quality === "preview"
        ? PREVIEW_RESOLUTION_SCALE
        : 1;
    const pixelBudget = quality === "interactive"
      ? INTERACTIVE_PIXEL_BUDGET
      : quality === "preview"
        ? PREVIEW_PIXEL_BUDGET
        : FULL_PIXEL_BUDGET;
    const devicePixelRatio = Math.min(
      Math.max(window.devicePixelRatio || 1, 1),
      MAX_DEVICE_PIXEL_RATIO,
    );
    const requestedPixelRatio = devicePixelRatio * resolutionScale;
    const requestedWidth = Math.max(
      1,
      this.canvas.clientWidth * requestedPixelRatio,
    );
    const requestedHeight = Math.max(
      1,
      this.canvas.clientHeight * requestedPixelRatio,
    );
    const budgetScale = Math.min(
      1,
      Math.sqrt(pixelBudget / (requestedWidth * requestedHeight)),
    );
    const width = Math.max(1, Math.round(requestedWidth * budgetScale));
    const height = Math.max(1, Math.round(requestedHeight * budgetScale));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

}

function gestureMetrics(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  return {
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}
