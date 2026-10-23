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

const RESULT_INTERACTION: ViewportInteraction = {
  pan: true,
  zoom: true,
  select: false,
};

function ResultMap({
  record,
  paletteId,
}: {
  record: RoundRecord;
  paletteId: MandelbrotPaletteId;
}) {
  const viewportRef = useRef<FractalViewportHandle>(null);
  const fittedRecordRef = useRef<string | null>(null);
  const [view, setView] = useState<ViewSnapshot | null>(null);
  const target = targetOf(record.question);
  const camera = useMemo(() => revealCamera(record), [record]);
  const zoomLimits = useMemo<ZoomLimits>(() => ({
    min: 0.1,
    max: explorationZoomLimit(record.question.magnification),
  }), [record.question.magnification]);
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
    );
  }, [record, target, view]);

  return (
    <div className="result-map">
      <FractalViewport
        ref={viewportRef}
        initialCamera={camera}
        interaction={RESULT_INTERACTION}
        zoomLimits={zoomLimits}
        paletteId={paletteId}
        ariaLabel="GUESSとTARGETを示す結果マップ"
        onViewChange={setView}
      />
      {connection && (
        <svg className="result-connection" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1={connection.start.x * 100} y1={connection.start.y * 100} x2={connection.end.x * 100} y2={connection.end.y * 100} />
        </svg>
      )}
      <MapMarker kind="guess" marker={guessMarker} label="GUESS" />
      <MapMarker kind="answer" marker={targetMarker} label="TARGET" />
      {view && <div className="result-map-scale">×{formatZoom(view.zoom)}</div>}
    </div>
  );
}

function ResultDetails({ record }: { record: RoundRecord }) {
  const target = targetOf(record.question);
  return (
    <div className="result-metrics">
      <p className="result-distance"><span title="出題画像の対角線を1とした、推測地点と正解地点の距離">誤差</span><strong>{record.score.normalizedDistance.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}<small> 画像対角線</small></strong></p>
      <details className="result-coordinates">
        <summary>座標<UiIcon name="chevron" /></summary>
        <dl className="coordinate-comparison">
          <div><dt><i className="marker-key guess-key" />GUESS</dt><dd>{formatComplex(record.guess, record.question.magnification)}</dd></div>
          <div><dt><i className="marker-key answer-key" />TARGET</dt><dd>{formatComplex(target, record.question.magnification)}</dd></div>
        </dl>
        <p className="coordinate-distance">距離 {formatCoordinateDistance(record.score.coordinateDistance)}</p>
      </details>
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
  return (
    <main className="game-prototype result-scene screen-enter">
      <GameHeader label={`ROUND ${roundIndex + 1} / ${totalRounds}`} onHome={onHome} onMenu={onMenu} />
      <section className="result-stage">
        <div className="result-map-column"><ResultMap record={record} paletteId={paletteId} /></div>
        <aside className="round-result-card">
          <header className="result-heading"><span>ROUND SCORE</span></header>
          <p className="result-score"><strong>{record.score.points.toLocaleString()}</strong><span>/ {MAX_ROUND_SCORE.toLocaleString()}</span></p>
          <div className="score-meter" aria-hidden="true"><span style={{ width: `${record.score.points / MAX_ROUND_SCORE * 100}%` }} /></div>
          <ResultDetails record={record} />
          {debug && (
            <div className="round-feedback" aria-label="ターゲットの評価">
              <span>ターゲットの質</span>
              <div>{([ ["good", "良問"], ["too-hard", "難しすぎる"], ["poor-frame", "表示不良"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={feedback === value} onClick={() => onFeedback(value)}>{label}</button>)}</div>
            </div>
          )}
          <button className="primary-action" type="button" onClick={onContinue}>{isLastRound ? "RESULT" : "NEXT ROUND"}<UiIcon name="arrow" /></button>
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
  const selectedRecord = records[selectedBreakdown] ?? records[0];
  return (
    <main className="game-prototype breakdown-scene screen-enter">
      <GameHeader label="RESULT" onHome={onHome} onMenu={onMenu} />
      <section className="breakdown-stage">
        <aside className="breakdown-panel">
          <header className="breakdown-title">
            <span>TOTAL SCORE</span>
            <h2>{totalScore.toLocaleString()}</h2>
            <p>/ {(MAX_ROUND_SCORE * records.length).toLocaleString()}</p>
            <div className="score-meter" aria-hidden="true"><span style={{ width: `${totalScore / (MAX_ROUND_SCORE * records.length) * 100}%` }} /></div>
            <details className="game-summary"><summary>ゲーム情報<UiIcon name="chevron" /></summary><small>{rulesSummary(gameRules)}</small><strong>AVG {averageScore.toLocaleString()}</strong></details>
          </header>
          <div className="round-list" role="list">
            {records.map((record, index) => (
              <button key={record.question.id} className={index === selectedBreakdown ? "is-selected" : ""} type="button" onClick={() => onSelectRound(index)} aria-pressed={index === selectedBreakdown}>
                <span>ROUND {index + 1}</span><strong>{record.score.points.toLocaleString()}</strong>
              </button>
            ))}
          </div>
          <div className="breakdown-actions breakdown-footer">
            <button className="primary-action" type="button" onClick={onPlayAgain}><UiIcon name="play" />PLAY AGAIN</button>
            <button className="icon-button share-result-button" type="button" onClick={onShare} aria-label="結果を共有" title="結果を共有"><UiIcon name="share" /></button>
            <button className="secondary-action breakdown-new-game" type="button" onClick={onNewGame}>NEW GAME</button>
          </div>
        </aside>
        <div className="breakdown-detail" key={selectedRecord.question.id}>
          <div className="breakdown-map"><ResultMap record={selectedRecord} paletteId={paletteId} /></div>
          <section className="selected-round-detail">
            <header><span>ROUND {selectedBreakdown + 1}</span><strong>{selectedRecord.score.points.toLocaleString()} / {MAX_ROUND_SCORE.toLocaleString()}</strong></header>
            <ResultDetails record={selectedRecord} />
          </section>
        </div>
      </section>
      {overlays}
      {shareDialog}
    </main>
  );
}
