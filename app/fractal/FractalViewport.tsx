"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { WebGLMandelbrotRenderer } from "./WebGLMandelbrotRenderer";
import { fixedCenterCorrection } from "./camera";
import { useLanguage } from "../i18n/LanguageProvider";
import type {
  Camera,
  ComplexCoordinate,
  ViewSnapshot,
  ViewportInteraction,
  ZoomLimits,
} from "./types";
import {
  DEFAULT_MANDELBROT_PALETTE_ID,
  type MandelbrotPaletteId,
} from "./mandelbrot-palettes";

export type FractalViewportHandle = {
  reset: () => void;
  focus: (centerRe: number, centerIm: number, zoom: number) => void;
};

type FractalViewportProps = {
  initialCamera: Camera;
  interaction: ViewportInteraction;
  zoomLimits?: ZoomLimits;
  ariaLabel: string;
  onViewChange?: (snapshot: ViewSnapshot) => void;
  onSelect?: (coordinate: ComplexCoordinate) => void;
  paletteId?: MandelbrotPaletteId;
  fixedCenter?: ComplexCoordinate;
};

export const FractalViewport = forwardRef<
  FractalViewportHandle,
  FractalViewportProps
>(function FractalViewport(
  {
    initialCamera,
    interaction,
    zoomLimits,
    ariaLabel,
    onViewChange,
    onSelect,
    paletteId = DEFAULT_MANDELBROT_PALETTE_ID,
    fixedCenter,
  },
  ref,
) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLMandelbrotRenderer | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  const onSelectRef = useRef(onSelect);
  const paletteIdRef = useRef(paletteId);
  const fixedCenterRef = useRef(fixedCenter);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  onViewChangeRef.current = onViewChange;
  onSelectRef.current = onSelect;
  paletteIdRef.current = paletteId;
  fixedCenterRef.current = fixedCenter;

  useImperativeHandle(ref, () => ({
    reset: () => rendererRef.current?.reset(),
    focus: (centerRe, centerIm, zoom) =>
      rendererRef.current?.focus(centerRe, centerIm, zoom),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const renderer = new WebGLMandelbrotRenderer(canvas, {
        initialCamera,
        interaction,
        zoomLimits,
        paletteId: paletteIdRef.current,
        onViewChange: (snapshot) => {
          const locked = fixedCenterRef.current;
          const correction = locked
            ? fixedCenterCorrection(snapshot, locked)
            : null;
          if (correction) {
            rendererRef.current?.focus(
              correction.centerRe,
              correction.centerIm,
              correction.zoom,
            );
            return;
          }
          onViewChangeRef.current?.(snapshot);
        },
        onSelect: (coordinate) => onSelectRef.current?.(coordinate),
      });
      rendererRef.current = renderer;

      return () => {
        renderer.dispose();
        rendererRef.current = null;
      };
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "フラクタル表示を開始できませんでした。",
      );
    }
  }, [initialCamera, interaction, retryKey, zoomLimits]);

  useEffect(() => {
    rendererRef.current?.setPalette(paletteId);
  }, [paletteId]);

  const acceptsInput = interaction.pan || interaction.zoom || interaction.select;
  const interactionClass = interaction.select
    ? "can-select"
    : interaction.pan
      ? "can-pan"
      : "is-fixed";

  return (
    <div className="fractal-viewport">
      <canvas
        ref={canvasRef}
        className={`fractal-canvas ${interactionClass}`}
        aria-label={ariaLabel}
        tabIndex={acceptsInput ? 0 : -1}
      />
      {error && (
        <div className="renderer-error">
          <p>{t("rendererUnavailable")}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRetryKey((value) => value + 1);
            }}
          >
            {t("rendererRetry")}
          </button>
        </div>
      )}
    </div>
  );
});
