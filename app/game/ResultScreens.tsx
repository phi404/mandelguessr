"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { formatComplex, formatCoordinateDistance, formatZoom } from "./formatting";
import { GameHeader } from "./GameOverlays";
import { revealCamera, rulesSummary, targetOf } from "./game-display";
import type { GameRules } from "./game-rules";
import { explorationZoomLimit } from "./game-rules";
import type { RoundRecord } from "./game-session";
import { MapMarker, markerPosition } from "./MapMarkers";
import type { QuestionFeedback } from "./playtest-data";
import { clipSegmentToViewport, fitResultCamera } from "./result-map";
import { MAX_ROUND_SCORE } from "./score-guess";
import { UiIcon } from "./UiIcon";
import { useLanguage } from "../i18n/LanguageProvider";

const RESULT_INTERACTION: ViewportInteraction = {
  pan: true,
  zoom: true,
  select: false,
};

function ResultMap({
  record,
  paletteId,
  reveal = false,
}: {
  record: RoundRecord;
  paletteId: MandelbrotPaletteId;
  reveal?: boolean;
}) {
  const { t } = useLanguage();
  const viewportRef = useRef<FractalViewportHandle>(null);
  const fittedRecordRef = useRef<string | null>(null);
  const [view, setView] = useState<ViewSnapshot | null>(null);
  const target = targetOf(record.question);
  const camera = useMemo(() => revealCamera(record), [record]);
  const zoomLimits = useMemo<ZoomLimits>(() => ({
    min: 0.1,
    max: explorationZoomLimit(),
  }), []);
  const guessMarker = markerPosition(record.guess, view);
  const targetMarker = markerPosition(target, view);
  const connection = guessMarker && targetMarker
    ? clipSegmentToViewport(guessMarker, targetMarker)
    : null;

  useEffect(() => {
    if (!view || fittedRecordRef.current === record.question.id) return;
    fittedRecordRef.current = record.question.id;
    const fittedCamera = fitResultCamera(
      record.guess,
      target,
      view.pixelHeight / Math.max(view.pixelWidth, 1),
      record.question.camera.viewportWidth * 2.5,
    );
    viewportRef.current?.focus(
      fittedCamera.centerRe,
      fittedCamera.centerIm,
      INITIAL_CAMERA.viewportWidth / fittedCamera.viewportWidth,
      fittedCamera.centerReLow,
      fittedCamera.centerImLow,
    );
  }, [record, target, view]);

  return (
    <div className={`result-map${reveal ? " is-revealing" : ""}`}>
      <FractalViewport
        ref={viewportRef}
        initialCamera={camera}
        interaction={RESULT_INTERACTION}
        zoomLimits={zoomLimits}
        paletteId={paletteId}
        ariaLabel={t("resultMap")}
        onViewChange={setView}
      />
      {connection && (
        <svg className="result-connection" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1={connection.start.x * 100} y1={connection.start.y * 100} x2={connection.end.x * 100} y2={connection.end.y * 100} />
        </svg>
      )}
      <MapMarker kind="guess" marker={guessMarker} label={t("guess")} />
      <MapMarker kind="answer" marker={targetMarker} label={t("target")} />
      {view && <div className="result-map-scale">×{formatZoom(view.zoom)}</div>}
    </div>
  );
}

function ResultDetails({ record }: { record: RoundRecord }) {
  const { t } = useLanguage();
  const target = targetOf(record.question);
  return (
    <div className="result-metrics">
      <p className="result-distance"><span title={t("distanceHelp")}>{t("distanceError")}</span><strong>{formatCoordinateDistance(record.score.coordinateDistance)}</strong></p>
      <section className="result-coordinates" aria-label={t("coordinates")}>
        <dl className="coordinate-comparison">
          <div><dt><i className="marker-key guess-key" />{t("guess")}</dt><dd>{formatComplex(record.guess, record.question.magnification)}</dd></div>
          <div><dt><i className="marker-key answer-key" />{t("target")}</dt><dd>{formatComplex(target, record.question.magnification)}</dd></div>
        </dl>
      </section>
    </div>
  );
}

export function RoundResultScreen({
  record,
  roundIndex,
  totalRounds,
  isLastRound,
  paletteId,
  debug,
  feedback,
  onFeedback,
  onContinue,
  onHome,
  onMenu,
  overlays,
}: {
  record: RoundRecord;
  roundIndex: number;
  totalRounds: number;
  isLastRound: boolean;
  paletteId: MandelbrotPaletteId;
  debug: boolean;
  feedback: QuestionFeedback | undefined;
  onFeedback: (feedback: QuestionFeedback) => void;
  onContinue: () => void;
  onHome: () => void;
  onMenu: () => void;
  overlays: ReactNode;
}) {
  const { t, number } = useLanguage();
  return (
    <main className="game-prototype result-scene screen-enter">
      <GameHeader label={t("roundProgress", { current: roundIndex + 1, total: totalRounds })} onHome={onHome} onMenu={onMenu} />
      <section className="result-stage">
        <div className="result-map-column"><ResultMap key={record.question.id} record={record} paletteId={paletteId} reveal /></div>
        <aside className="round-result-card">
          <header className="result-heading"><h2>{t("roundResult")}</h2></header>
          <p className="result-score"><span>{t("roundScore")}</span><strong>{number(record.score.points)}</strong><span>/ {number(MAX_ROUND_SCORE)}</span></p>
          <div className="score-meter" aria-hidden="true"><span style={{ width: `${record.score.points / MAX_ROUND_SCORE * 100}%` }} /></div>
          <ResultDetails record={record} />
          {debug && (
            <div className="round-feedback" aria-label={t("targetFeedback")}>
              <span>{t("targetQuality")}</span>
              <div>{([ ["good", t("goodQuestion")], ["too-hard", t("tooHard")], ["poor-frame", t("poorFrame")] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={feedback === value} onClick={() => onFeedback(value)}>{label}</button>)}</div>
            </div>
          )}
          <button className="primary-action" type="button" onClick={onContinue}>{isLastRound ? t("result") : t("nextRound")}<UiIcon name="arrow" /></button>
        </aside>
      </section>
      {overlays}
    </main>
  );
}

export function FinalResultScreen({
  records,
  selectedBreakdown,
  totalScore,
  averageScore,
  gameRules,
  paletteId,
  onSelectRound,
  onPlayAgain,
  onShare,
  onNewGame,
  onHome,
  onMenu,
  overlays,
  shareDialog,
}: {
  records: RoundRecord[];
  selectedBreakdown: number;
  totalScore: number;
  averageScore: number;
  gameRules: GameRules;
  paletteId: MandelbrotPaletteId;
  onSelectRound: (index: number) => void;
  onPlayAgain: () => void;
  onShare: () => void;
  onNewGame: () => void;
  onHome: () => void;
  onMenu: () => void;
  overlays: ReactNode;
  shareDialog: ReactNode;
}) {
  const { t, number, language } = useLanguage();
  const meanDistance = records.length ? records.reduce((sum, record) => sum + record.score.coordinateDistance, 0) / records.length : 0;
  const selectedRecord = records[selectedBreakdown] ?? records[0];
  return (
    <main className="game-prototype breakdown-scene screen-enter">
      <GameHeader label={t("result")} onHome={onHome} onMenu={onMenu} />
      <section className="breakdown-stage">
        <aside className="breakdown-panel">
          <header className="breakdown-title">
            <span>{t("totalScore")}</span>
            <h2 className="total-score">{number(totalScore)}<small>/ {number(MAX_ROUND_SCORE * records.length)}</small></h2>
            <p>{t("averageScore")} {number(averageScore)}</p>
            <div className="score-meter" aria-hidden="true"><span style={{ width: `${totalScore / (MAX_ROUND_SCORE * records.length) * 100}%` }} /></div>
            <p className="mean-distance" title={t("meanDistanceHelp")}>{t("averageDistance")} <strong>{formatCoordinateDistance(meanDistance)}</strong></p>
            <details className="game-summary"><summary>{t("gameDetails")}<UiIcon name="chevron" /></summary><small>{rulesSummary(gameRules, language)}</small></details>
          </header>
          <div className="round-list" role="list">
            {records.map((record, index) => (
              <button key={record.question.id} className={index === selectedBreakdown ? "is-selected" : ""} type="button" onClick={() => onSelectRound(index)} aria-pressed={index === selectedBreakdown}>
                <span>{t("roundLabel", { round: index + 1 })}</span><strong>{number(record.score.points)}</strong>
              </button>
            ))}
          </div>
          <div className="breakdown-actions breakdown-footer">
            <button className="primary-action" type="button" onClick={onPlayAgain}><UiIcon name="play" />{t("playAgain")}</button>
            <button className="icon-button share-result-button" type="button" onClick={onShare} aria-label={t("shareResult")} title={t("shareResult")}><UiIcon name="share" /></button>
            <button className="secondary-action breakdown-new-game" type="button" onClick={onNewGame}>{t("newGame")}</button>
          </div>
        </aside>
        <div className="breakdown-detail" key={selectedRecord.question.id}>
          <div className="breakdown-map"><ResultMap record={selectedRecord} paletteId={paletteId} /></div>
          <section className="selected-round-detail">
            <header><span>{t("roundLabel", { round: selectedBreakdown + 1 })}</span><strong>{t("roundScore")} {number(selectedRecord.score.points)} / {number(MAX_ROUND_SCORE)}</strong></header>
            <ResultDetails record={selectedRecord} />
          </section>
        </div>
      </section>
      {overlays}
      {shareDialog}
    </main>
  );
}
