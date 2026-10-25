import type { ReactNode, RefObject } from "react";
import { useLanguage } from "../i18n/LanguageProvider";
import {
  FractalViewport,
  type FractalViewportHandle,
} from "../fractal/FractalViewport";
import { INITIAL_CAMERA } from "../fractal/camera";
import type {
  ComplexCoordinate,
  ViewSnapshot,
  ViewportInteraction,
  ZoomLimits,
} from "../fractal/types";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { FloatingQuestionWindow } from "./FloatingQuestionWindow";
import { formatComplex, formatZoom } from "./formatting";
import { GameHeader } from "./GameOverlays";
import { UiIcon } from "./UiIcon";
import { targetOf } from "./game-display";
import type { GameRules } from "./game-rules";
import {
  MapMarker,
  QuestionTarget,
  type MarkerPosition,
} from "./MapMarkers";
import type { PrototypeQuestion } from "./question-generator";

const MAP_INTERACTION: ViewportInteraction = {
  pan: true,
  zoom: true,
  select: true,
};

export function PlayScreen({
  mapRef,
  questionRef,
  playStageRef,
  question,
  roundIndex,
  totalRounds,
  gameRules,
  guess,
  mapView,
  questionView,
  guessMarker,
  questionTargetMarker,
  explorationZoomLimits,
  questionZoomLimits,
  questionInteraction,
  paletteId,
  onMapViewChange,
  onQuestionViewChange,
  onGuess,
  onSubmit,
  onHome,
  onMenu,
  overlays,
}: {
  mapRef: RefObject<FractalViewportHandle | null>;
  questionRef: RefObject<FractalViewportHandle | null>;
  playStageRef: RefObject<HTMLElement | null>;
  question: PrototypeQuestion;
  roundIndex: number;
  totalRounds: number;
  gameRules: GameRules;
  guess: ComplexCoordinate | null;
  mapView: ViewSnapshot | null;
  questionView: ViewSnapshot | null;
  guessMarker: MarkerPosition | null;
  questionTargetMarker: MarkerPosition | null;
  explorationZoomLimits: ZoomLimits;
  questionZoomLimits: ZoomLimits;
  questionInteraction: ViewportInteraction;
  paletteId: MandelbrotPaletteId;
  onMapViewChange: (view: ViewSnapshot) => void;
  onQuestionViewChange: (view: ViewSnapshot) => void;
  onGuess: (guess: ComplexCoordinate) => void;
  onSubmit: () => void;
  onHome: () => void;
  onMenu: () => void;
  overlays: ReactNode;
}) {
  const { t } = useLanguage();
  const mapCenter = mapView
    ? { re: mapView.centerRe, im: mapView.centerIm, reLow: mapView.centerReLow, imLow: mapView.centerImLow }
    : null;
  const target = targetOf(question);
  const questionMeta = questionView && gameRules.questionInspectAllowed
    && Math.abs(questionView.zoom - gameRules.magnification) > gameRules.magnification * 1e-4
    ? `${t("targetCaption")} ×${gameRules.magnification} → ×${formatZoom(questionView.zoom)}`
    : `${t("targetCaption")} ×${gameRules.magnification}`;

  return (
    <main className="game-prototype play-scene screen-enter">
      <GameHeader label={t("roundProgress", { current: roundIndex + 1, total: totalRounds })} onHome={onHome} onMenu={onMenu} />
      <section className="exploration-stage">
        <article className="exploration-frame" ref={playStageRef}>
          <FractalViewport key={`map-${question.id}`} ref={mapRef} initialCamera={INITIAL_CAMERA} interaction={MAP_INTERACTION} zoomLimits={explorationZoomLimits} paletteId={paletteId} ariaLabel={t("guessMap")} onViewChange={onMapViewChange} onSelect={onGuess} />
          <div className="map-marker-layer"><MapMarker kind="guess" marker={guessMarker} /></div>
          <div className="exploration-hud" title={mapView && mapCenter ? formatComplex(mapCenter, mapView.zoom) : undefined}><UiIcon name="zoom" /><strong>{mapView ? `×${formatZoom(mapView.zoom)}` : "×1"}</strong></div>
          <button className="icon-button map-reset" type="button" onClick={() => mapRef.current?.reset()} aria-label={t("resetMap")} title={t("overview")}><UiIcon name="reset" /></button>
          <FloatingQuestionWindow containerRef={playStageRef} meta={questionMeta}>
            <FractalViewport
              key={`question-${question.id}`}
              ref={questionRef}
              initialCamera={question.camera}
              interaction={questionInteraction}
              zoomLimits={questionZoomLimits}
              fixedCenter={!gameRules.questionPanAllowed && gameRules.questionInspectAllowed ? target : undefined}
              paletteId={paletteId}
              ariaLabel={t("targetImage")}
              onViewChange={onQuestionViewChange}
            />
            <QuestionTarget marker={questionTargetMarker} />
            {(gameRules.questionPanAllowed || gameRules.questionInspectAllowed) && <button className="icon-button question-reset" type="button" onClick={() => questionRef.current?.reset()} aria-label={t("resetTarget")} title={t("resetView")}><UiIcon name="reset" /></button>}
          </FloatingQuestionWindow>
          <div className="guess-controls">
            <div className={`guess-coordinate ${guess ? "has-guess" : ""}`} aria-live="polite"><UiIcon name="target" />{guess ? <code>{formatComplex(guess, mapView?.zoom ?? 1)}</code> : <span className="guess-coordinate-label">{t("selectPoint")}</span>}</div>
            <button className="submit-guess" type="button" disabled={!guess} onClick={onSubmit} aria-label={t("submitGuess")}><span className="button-label">{t("guessAction")}</span><UiIcon name="arrow" /></button>
          </div>
        </article>
      </section>
      {overlays}
    </main>
  );
}
