import type { ReactNode, RefObject } from "react";
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
  const mapCenter = mapView
    ? { re: mapView.centerRe, im: mapView.centerIm }
    : null;
  const target = targetOf(question);
  const questionMeta = questionView && gameRules.questionInspectAllowed
    && Math.abs(questionView.zoom - gameRules.magnification) > gameRules.magnification * 1e-4
    ? `TARGET ×${gameRules.magnification} → ×${formatZoom(questionView.zoom)}`
    : `TARGET ×${gameRules.magnification}`;

  return (
    <main className="game-prototype play-scene screen-enter">
      <GameHeader label={`ROUND ${roundIndex + 1} / ${totalRounds}`} onHome={onHome} onMenu={onMenu} />
      <section className="exploration-stage">
        <article className="exploration-frame" ref={playStageRef}>
          <FractalViewport key={`map-${question.id}`} ref={mapRef} initialCamera={INITIAL_CAMERA} interaction={MAP_INTERACTION} zoomLimits={explorationZoomLimits} paletteId={paletteId} ariaLabel="推測地点を選択するマンデルブロ集合の探索マップ" onViewChange={onMapViewChange} onSelect={onGuess} />
          <div className="map-marker-layer"><MapMarker kind="guess" marker={guessMarker} /></div>
          <div className="exploration-hud" title={mapView && mapCenter ? formatComplex(mapCenter, mapView.zoom) : undefined}><UiIcon name="zoom" /><strong>{mapView ? `×${formatZoom(mapView.zoom)}` : "×1"}</strong></div>
          <button className="icon-button map-reset" type="button" onClick={() => mapRef.current?.reset()} aria-label="探索マップを全体表示へ戻す" title="全体表示"><UiIcon name="reset" /></button>
          <FloatingQuestionWindow containerRef={playStageRef} meta={questionMeta}>
            <FractalViewport
              key={`question-${question.id}`}
              ref={questionRef}
              initialCamera={question.camera}
              interaction={questionInteraction}
              zoomLimits={questionZoomLimits}
              fixedCenter={!gameRules.questionPanAllowed && gameRules.questionInspectAllowed ? target : undefined}
              paletteId={paletteId}
              ariaLabel="出題されたマンデルブロ集合の局所画像"
              onViewChange={onQuestionViewChange}
            />
            <QuestionTarget marker={questionTargetMarker} />
            {(gameRules.questionPanAllowed || gameRules.questionInspectAllowed) && <button className="icon-button question-reset" type="button" onClick={() => questionRef.current?.reset()} aria-label="TARGETを初期表示へ戻す" title="初期表示へ戻す"><UiIcon name="reset" /></button>}
          </FloatingQuestionWindow>
          <div className="guess-controls">
            <div className={`guess-coordinate ${guess ? "has-guess" : ""}`} aria-live="polite"><UiIcon name="target" />{guess ? <code>{formatComplex(guess, mapView?.zoom ?? 1)}</code> : <span className="guess-coordinate-label">地点を選択</span>}</div>
            <button className="submit-guess" type="button" disabled={!guess} onClick={onSubmit} aria-label="推測を確定"><span className="button-label">GUESS</span><UiIcon name="arrow" /></button>
          </div>
        </article>
      </section>
      {overlays}
    </main>
  );
}
