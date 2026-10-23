import type { ReactNode, RefObject } from "react";
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
  const center = view ? { re: view.centerRe, im: view.centerIm } : null;
  return (
    <main className="game-prototype explore-scene screen-enter">
      <GameHeader label="EXPLORE" onHome={onHome} onMenu={onMenu} />
      <section className="exploration-stage">
        <article className="exploration-frame">
          <FractalViewport ref={viewportRef} initialCamera={INITIAL_CAMERA} interaction={EXPLORE_INTERACTION} zoomLimits={zoomLimits} paletteId={paletteId} ariaLabel="マンデルブロ集合の自由探索マップ" onViewChange={onViewChange} />
          <div className="exploration-hud" title={view && center ? formatComplex(center, view.zoom) : undefined}><UiIcon name="zoom" /><strong>{view ? `×${formatZoom(view.zoom)}` : "×1"}</strong></div>
          <button className="icon-button map-reset" type="button" onClick={() => viewportRef.current?.reset()} aria-label="全体表示へ戻す" title="全体表示"><UiIcon name="reset" /></button>
          <div className="explore-controls"><span><UiIcon name="move" />ドラッグ</span><span><UiIcon name="zoom" />ホイール / ピンチ</span></div>
        </article>
      </section>
      {overlays}
    </main>
  );
}
