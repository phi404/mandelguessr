import type { ReactNode, RefObject } from "react";
import { useLanguage } from "../i18n/LanguageProvider";
import {
  FractalViewport,
  type FractalViewportHandle,
} from "../fractal/FractalViewport";
import { INITIAL_CAMERA } from "../fractal/camera";
import type {
  ViewSnapshot,
  ViewportInteraction,
  ZoomLimits,
} from "../fractal/types";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { formatComplex, formatZoom } from "./formatting";
import { GameHeader } from "./GameOverlays";
import { UiIcon } from "./UiIcon";

const EXPLORE_INTERACTION: ViewportInteraction = {
  pan: true,
  zoom: true,
  select: false,
};

export function ExploreScreen({
  viewportRef,
  view,
  zoomLimits,
  paletteId,
  onViewChange,
  onHome,
  onMenu,
  overlays,
}: {
  viewportRef: RefObject<FractalViewportHandle | null>;
  view: ViewSnapshot | null;
  zoomLimits: ZoomLimits;
  paletteId: MandelbrotPaletteId;
  onViewChange: (view: ViewSnapshot) => void;
  onHome: () => void;
  onMenu: () => void;
  overlays: ReactNode;
}) {
  const { t } = useLanguage();
  const center = view ? { re: view.centerRe, im: view.centerIm, reLow: view.centerReLow, imLow: view.centerImLow } : { re: INITIAL_CAMERA.centerRe, im: INITIAL_CAMERA.centerIm };
  return (
    <main className="game-prototype explore-scene screen-enter">
      <GameHeader label={t("explore")} onHome={onHome} onMenu={onMenu} />
      <section className="exploration-stage">
        <article className="exploration-frame">
          <FractalViewport ref={viewportRef} initialCamera={INITIAL_CAMERA} interaction={EXPLORE_INTERACTION} zoomLimits={zoomLimits} paletteId={paletteId} ariaLabel={t("exploreMap")} onViewChange={onViewChange} />
          <div className="exploration-hud" title={view && center ? formatComplex(center, view.zoom) : undefined}><UiIcon name="zoom" /><strong>{view ? `×${formatZoom(view.zoom)}` : "×1"}</strong></div>
          <button className="icon-button map-reset" type="button" onClick={() => viewportRef.current?.reset()} aria-label={t("resetMap")} title={t("overview")}><UiIcon name="reset" /></button>
          <footer className="explore-controls">
            <output className="explore-coordinate" aria-label={t("centerCoordinates")}><code>{formatComplex(center, view?.zoom ?? 1)}</code></output>
            <div className="explore-hints"><span><UiIcon name="move" />{t("drag")}</span><span><UiIcon name="zoom" />{t("wheelPinch")}</span></div>
          </footer>
        </article>
      </section>
      {overlays}
    </main>
  );
}
