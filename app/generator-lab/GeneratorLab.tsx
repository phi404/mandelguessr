"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FractalViewport } from "../fractal/FractalViewport";
import { complexToScreen } from "../fractal/camera";
import { imageDataToPngBlob } from "../fractal/mandelbrot-export";
import { generateMandelbrotSample } from "../fractal/mandelbrot-render";
import { DEFAULT_MANDELBROT_PALETTE_ID, MANDELBROT_PALETTE_IDS, type MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { SCENE_CALIBRATION_EXAMPLES } from "../game/scene-quality-calibration";
import type {
  Camera,
  ComplexCoordinate,
  ViewSnapshot,
  ViewportInteraction,
} from "../fractal/types";
import {
  MANDELBROT_OVERVIEW_CAMERA,
  fullQualityIterationsForZoom,
  mandelbrotOverviewDiagonal,
  questionViewportGeometry,
} from "../fractal/mandelbrot-domain";
import { MAGNIFICATION_OPTIONS } from "../game/game-rules";
import { SCORE_CONFIG } from "../game/score-config";
import { createGameSeed } from "../game/seed";
import { scoreLabGuess } from "../game/score-guess";
import { DatasetExportPanel } from "./DatasetExportPanel";
import { generateLabQuestionsAsync } from "./generator-lab-client";
import { renderQuestionThumbnail } from "./thumbnail-client";
import {
  BOUNDARY_RESOLUTION_OPTIONS,
  DEFAULT_BOUNDARY_RESOLUTION,
  LAB_COUNT_OPTIONS,
  type GeneratorAlgorithm,
  type LabGenerationResult,
  type LabQuestion,
  type MandelbrotProbe,
} from "./generator-lab";

const FIXED_INTERACTION: ViewportInteraction = {
  pan: false,
  zoom: false,
  select: false,
};
const MAP_INTERACTION: ViewportInteraction = {
  pan: true,
  zoom: true,
  select: true,
};
const OVERVIEW_CAMERA: Camera = { ...MANDELBROT_OVERVIEW_CAMERA };
const MAP_ZOOM_LIMITS = { min: 0.7, max: 100_000 };
const PNG_EXPORT_WIDTH = 1280;
const PNG_EXPORT_HEIGHT = 800;

type ScreenPoint = {
  x: number;
  y: number;
  visible: boolean;
};

function formatCoordinate(value: number, magnification = 1) {
  const digits = Math.max(
    7,
    Math.min(14, 7 + Math.floor(Math.log10(Math.max(1, magnification)))),
  );
  const formatted = value.toFixed(digits);
  return Number(formatted) === 0 ? formatted.replace(/^-/, "") : formatted;
}

function formatComplex(point: ComplexCoordinate, magnification = 1) {
  return `${formatCoordinate(point.re, magnification)} ${point.im < 0 ? "−" : "+"} ${formatCoordinate(Math.abs(point.im), magnification)}i`;
}

function pointOnView(
  coordinate: ComplexCoordinate,
  view: ViewSnapshot | null,
): ScreenPoint | null {
  if (!view) return null;
  return complexToScreen(coordinate, view, {
    width: view.pixelWidth,
    height: view.pixelHeight,
  });
}

function algorithmLabel(algorithm: GeneratorAlgorithm) {
  switch (algorithm) {
    case "distance-visible":
      return "D · DISTANCE GUIDED + VISIBLE SCENE";
    case "current":
      return "A · BOUNDARY GRID (BASELINE)";
    case "uniform-valid-viewport":
      return "B · UNIFORM VALID VIEWPORT (APPROX)";
    case "boundary-element-offset":
      return "C · BOUNDARY ELEMENT + OFFSET";
  }
}

function LazyQuestionImage({ question, label, paletteId = DEFAULT_MANDELBROT_PALETTE_ID }: { question: Pick<LabQuestion, "camera" | "magnification" | "index">; label?: string; paletteId?: MandelbrotPaletteId }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: element.closest(".lab-gallery"), rootMargin: "80px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || rendered) return;
    let active = true;
    void renderQuestionThumbnail(question.camera, question.magnification, paletteId)
      .then(({ width, height, pixels }) => {
        if (!active) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        canvas.width = width;
        canvas.height = height;
        context.putImageData(
          new ImageData(new Uint8ClampedArray(pixels), width, height),
          0,
          0,
        );
        setRendered(true);
      })
      .catch(() => {
        // Keep the neutral placeholder; the main WebGL views remain usable.
      });
    return () => {
      active = false;
    };
  }, [question.camera, question.magnification, paletteId, rendered, visible]);

  return (
    <div ref={rootRef} className="lab-thumbnail">
      <canvas ref={canvasRef} aria-label={label ?? `問題 ${question.index + 1} の画像`} />
      {!rendered && <div className="lab-thumbnail-placeholder">{visible ? "rendering" : "queued"}</div>}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lab-stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step = "any",
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: string | number;
  suffix?: string;
}) {
  return (
    <label className="lab-number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function DebugSummary({ question }: { question: LabQuestion }) {
  const debug = question.debug;
  if (debug.kind === "distance-visible") {
    const { generation } = debug;
    return (
      <dl className="lab-compact-data">
        <div><dt>Color variance</dt><dd>{generation.quality.energy.toExponential(6)}</dd></div>
        <div><dt>Calibrated threshold</dt><dd>{generation.quality.threshold.toExponential(6)}</dd></div>
        <div><dt>Projection steps</dt><dd>{generation.projectionSteps}</dd></div>
        <div><dt>Anchor</dt><dd>{formatComplex(generation.anchor)}</dd></div>
        <div><dt>Near-boundary point</dt><dd>{formatComplex(generation.representative, question.magnification)}</dd></div>
      </dl>
    );
  }
  if (debug.kind === "current") {
    const inside = debug.samples.filter((sample) => !sample.escaped).length;
    return (
      <>
        <div className="lab-debug-flags">
          <span>SHOW CELL</span><span>SHOW SAMPLES</span><span>SHOW CLASSIFICATION</span>
          <span>SHOW SELECTED PAIR</span><span>SHOW TARGET</span>
        </div>
        <dl className="lab-compact-data">
          <div><dt>Cell</dt><dd>{debug.cell.column}, {debug.cell.row} / {debug.cell.gridSize}</dd></div>
          <div><dt>Classification</dt><dd>{inside} in · {debug.samples.length - inside} out</dd></div>
          <div><dt>Target</dt><dd>{formatComplex(debug.target, question.magnification)}</dd></div>
        </dl>
      </>
    );
  }
  if (debug.kind === "uniform-valid-viewport") {
    return (
      <>
        <div className="lab-debug-flags">
          <span>SHOW VIEWPORT</span><span>SHOW ACCEPTANCE TEST</span>
        </div>
        <dl className="lab-compact-data">
          <div><dt>Accepted by</dt><dd>{debug.acceptance}</dd></div>
          <div><dt>Probes</dt><dd>{debug.probes.length}</dd></div>
          <div><dt>Base / adaptive</dt><dd>{debug.baseGrid.columns}×{debug.baseGrid.rows} / depth {debug.baseGrid.adaptiveDepth}</dd></div>
        </dl>
      </>
    );
  }
  return (
    <>
      <div className="lab-debug-flags">
        <span>SHOW SELECTED ELEMENT</span><span>SHOW VIEWPORT OFFSET</span>
      </div>
      <dl className="lab-compact-data">
        <div><dt>Element</dt><dd>{debug.element.column}, {debug.element.row} / {debug.element.gridSize}</dd></div>
        <div><dt>Detected by</dt><dd>{debug.detection}</dd></div>
        <div><dt>Offset</dt><dd>{formatComplex(debug.viewportOffset, question.magnification)}</dd></div>
      </dl>
    </>
  );
}

function RectOverlay({
  rect,
  view,
  className,
}: {
  rect: { left: number; right: number; bottom: number; top: number };
  view: ViewSnapshot | null;
  className: string;
}) {
  const topLeft = pointOnView({ re: rect.left, im: rect.top }, view);
  const bottomRight = pointOnView({ re: rect.right, im: rect.bottom }, view);
  if (!topLeft || !bottomRight) return null;
  return (
    <rect
      className={className}
      x={`${topLeft.x * 100}%`}
      y={`${topLeft.y * 100}%`}
      width={`${(bottomRight.x - topLeft.x) * 100}%`}
      height={`${(bottomRight.y - topLeft.y) * 100}%`}
    />
  );
}

function ProbeOverlays({
  probes,
  view,
}: {
  probes: MandelbrotProbe[];
  view: ViewSnapshot | null;
}) {
  return probes.map((probe, index) => {
    const point = pointOnView(probe, view);
    if (!point?.visible) return null;
    return (
      <circle
        key={`${probe.re}-${probe.im}-${index}`}
        className={probe.escaped ? "probe-outside" : "probe-inside"}
        cx={`${point.x * 100}%`}
        cy={`${point.y * 100}%`}
        r="2.3"
      />
    );
  });
}

function DebugOverlay({
  question,
  view,
}: {
  question: LabQuestion;
  view: ViewSnapshot | null;
}) {
  const debug = question.debug;
  if (debug.kind === "distance-visible") {
    const representative = pointOnView(debug.generation.representative, view);
    return <>
      <RectOverlay rect={debug.viewport} view={view} className="debug-viewport" />
      {representative?.visible && <circle className="probe-outside" cx={`${representative.x * 100}%`} cy={`${representative.y * 100}%`} r="2.3" />}
    </>;
  }
  if (debug.kind === "current") {
    const inside = pointOnView(debug.selectedPair.inside, view);
    const outside = pointOnView(debug.selectedPair.outside, view);
    return (
      <>
        <RectOverlay rect={debug.cell} view={view} className="debug-cell" />
        <ProbeOverlays probes={debug.samples.map((sample) => ({
          ...sample,
          escapeIteration: null,
          distanceEstimate: null,
        }))} view={view} />
        {inside && outside && (
          <line
            className="debug-pair"
            x1={`${inside.x * 100}%`} y1={`${inside.y * 100}%`}
            x2={`${outside.x * 100}%`} y2={`${outside.y * 100}%`}
          />
        )}
      </>
    );
  }
  if (debug.kind === "uniform-valid-viewport") {
    return (
      <>
        <RectOverlay rect={debug.viewport} view={view} className="debug-viewport" />
        <ProbeOverlays probes={debug.probes} view={view} />
      </>
    );
  }
  const representative = pointOnView(debug.representative, view);
  const center = pointOnView(
    { re: question.camera.centerRe, im: question.camera.centerIm },
    view,
  );
  return (
    <>
      <RectOverlay rect={debug.element} view={view} className="debug-element" />
      <ProbeOverlays probes={debug.probes} view={view} />
      {representative && center && (
        <line
          className="debug-offset"
          x1={`${center.x * 100}%`} y1={`${center.y * 100}%`}
          x2={`${representative.x * 100}%`} y2={`${representative.y * 100}%`}
        />
      )}
    </>
  );
}

function OverviewMap({
  result,
  selected,
  answer,
  guess,
  showDebug,
  onSelectQuestion,
  onGuess,
}: {
  result: LabGenerationResult;
  selected: LabQuestion;
  answer: ComplexCoordinate;
  guess: ComplexCoordinate;
  showDebug: boolean;
  onSelectQuestion: (index: number) => void;
  onGuess: (coordinate: ComplexCoordinate) => void;
}) {
  const [view, setView] = useState<ViewSnapshot | null>(null);
  const answerPoint = pointOnView(answer, view);
  const guessPoint = pointOnView(guess, view);

  return (
    <div className="lab-overview-map">
      <FractalViewport
        initialCamera={OVERVIEW_CAMERA}
        interaction={MAP_INTERACTION}
        zoomLimits={MAP_ZOOM_LIMITS}
        ariaLabel="Generator Lab overview map。クリックでGUESSを設定"
        onViewChange={setView}
        onSelect={onGuess}
      />
      <svg className="lab-map-svg" aria-hidden="true">
        {answerPoint && guessPoint && (
          <line
            className="score-link"
            x1={`${answerPoint.x * 100}%`} y1={`${answerPoint.y * 100}%`}
            x2={`${guessPoint.x * 100}%`} y2={`${guessPoint.y * 100}%`}
          />
        )}
        {showDebug && <DebugOverlay question={selected} view={view} />}
      </svg>
      <div className="lab-center-markers">
        {result.questions.map((question) => {
          const position = pointOnView(
            { re: question.camera.centerRe, im: question.camera.centerIm },
            view,
          );
          if (!position?.visible) return null;
          return (
            <button
              key={question.id}
              type="button"
              className={`lab-center-dot ${question.index === selected.index ? "is-selected" : ""}`}
              style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
              onClick={() => onSelectQuestion(question.index)}
              title={`#${question.index + 1}`}
              aria-label={`問題 ${question.index + 1} を選択`}
            />
          );
        })}
        {answerPoint?.visible && (
          <span
            className="lab-score-marker answer"
            style={{ left: `${answerPoint.x * 100}%`, top: `${answerPoint.y * 100}%` }}
          >A</span>
        )}
        {guessPoint?.visible && (
          <span
            className="lab-score-marker guess"
            style={{ left: `${guessPoint.x * 100}%`, top: `${guessPoint.y * 100}%` }}
          >G</span>
        )}
      </div>
      <div className="lab-map-legend">
        <span><i className="legend-center" /> centers</span>
        <span><i className="legend-answer" /> answer</span>
        <span><i className="legend-guess" /> guess</span>
      </div>
    </div>
  );
}

export function GeneratorLab() {
  const [algorithm, setAlgorithm] = useState<GeneratorAlgorithm>("distance-visible");
  const [scenePalette, setScenePalette] = useState<MandelbrotPaletteId>(DEFAULT_MANDELBROT_PALETTE_ID);
  const [magnification, setMagnification] = useState(100);
  const [seed, setSeed] = useState(20260820);
  const [count, setCount] = useState(50);
  const [boundaryResolution, setBoundaryResolution] = useState(
    DEFAULT_BOUNDARY_RESOLUTION,
  );
  const [result, setResult] = useState<LabGenerationResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [answer, setAnswer] = useState<ComplexCoordinate>({ re: -0.75, im: 0 });
  const [guess, setGuess] = useState<ComplexCoordinate>({ re: -0.75, im: 0 });
  const [scoreMagnification, setScoreMagnification] = useState(100);
  const [halfDistancePercent, setHalfDistancePercent] = useState<number>(
    SCORE_CONFIG.halfDistance,
  );
  const [tolerancePercent, setTolerancePercent] = useState<number>(
    SCORE_CONFIG.fullScoreTolerance,
  );
  const [exportingPng, setExportingPng] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const selected = result?.questions[selectedIndex] ?? null;
  const firstQuestion = result?.questions[0];
  const resultPalette = firstQuestion?.debug.kind === "distance-visible"
    ? firstQuestion.debug.generation.quality.paletteId : DEFAULT_MANDELBROT_PALETTE_ID;
  const scoring = useMemo(() => {
    try {
      return {
        value: scoreLabGuess(
          guess,
          answer,
          scoreMagnification,
          halfDistancePercent / 100,
          tolerancePercent / 100,
        ),
        error: null,
      };
    } catch (cause) {
      return {
        value: null,
        error: cause instanceof Error ? cause.message : "採点値が不正です。",
      };
    }
  }, [answer, guess, scoreMagnification, halfDistancePercent, tolerancePercent]);

  const scoringCamera = useMemo<Camera>(() => ({
    centerRe: answer.re,
    centerIm: answer.im,
    viewportWidth:
      Number.isFinite(scoreMagnification) && scoreMagnification > 0
        ? questionViewportGeometry(scoreMagnification).width
        : MANDELBROT_OVERVIEW_CAMERA.viewportWidth,
  }), [answer, scoreMagnification]);

  const selectQuestion = (index: number, source = result) => {
    const question = source?.questions[index];
    if (!question) return;
    const center = {
      re: question.camera.centerRe,
      im: question.camera.centerIm,
    };
    setSelectedIndex(index);
    setAnswer(center);
    setGuess(center);
    setScoreMagnification(question.magnification);
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const next = await generateLabQuestionsAsync({
        algorithm,
        magnification,
        seed,
        count,
        boundaryResolution,
        paletteId: algorithm === "distance-visible" ? scenePalette : undefined,
      });
      setResult(next);
      selectQuestion(0, next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "問題を生成できませんでした。");
    } finally {
      setGenerating(false);
    }
  };

  const exportScoringViewport = async () => {
    setExportingPng(true);
    setExportStatus(null);
    try {
      const sample = generateMandelbrotSample({
        centerRe: answer.re,
        centerIm: answer.im,
        zoom: scoreMagnification,
        width: PNG_EXPORT_WIDTH,
        height: PNG_EXPORT_HEIGHT,
        paletteId: resultPalette,
        maxIterations: fullQualityIterationsForZoom(scoreMagnification),
      });
      const blob = await imageDataToPngBlob(sample.image);
      const decodedPng = await createImageBitmap(blob);
      if (
        decodedPng.width !== sample.image.width ||
        decodedPng.height !== sample.image.height
      ) {
        decodedPng.close();
        throw new Error("PNGのdecode後の寸法がImageDataと一致しません。");
      }
      decodedPng.close();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mandelguessr-lab-q${selectedIndex + 1}-x${scoreMagnification}.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setExportStatus(
        `PNG ready · ${sample.image.width}×${sample.image.height} · ${sample.metadata.rendererVersion}`,
      );
    } catch (cause) {
      setExportStatus(
        cause instanceof Error ? cause.message : "PNGを書き出せませんでした。",
      );
    } finally {
      setExportingPng(false);
    }
  };

  return (
    <main className="generator-lab">
      <header className="lab-header">
        <div>
          <p>DEVELOPMENT TOOL</p>
          <h1>Generator Lab</h1>
        </div>
        <a href={import.meta.env.BASE_URL}>MandelGuessr ↗</a>
      </header>

      <section className="lab-settings" aria-labelledby="generator-settings-title">
        <div className="lab-section-heading">
          <div><span>01</span><h2 id="generator-settings-title">GENERATOR SETTINGS</h2></div>
          <p>Each accepted sample is drawn independently from the selected finite rule.</p>
        </div>
        <div className="lab-setting-grid">
          <label>
            <span>ALGORITHM</span>
            <select value={algorithm} onChange={(event) => setAlgorithm(event.currentTarget.value as GeneratorAlgorithm)}>
              <option value="distance-visible">D · DISTANCE GUIDED + VISIBLE SCENE</option>
              <option value="current">A · BOUNDARY GRID (BASELINE)</option>
              <option value="uniform-valid-viewport">B · UNIFORM VALID VIEWPORT (APPROX)</option>
              <option value="boundary-element-offset">C · BOUNDARY ELEMENT + RANDOM OFFSET</option>
            </select>
          </label>
          <label>
            <span>MAGNIFICATION</span>
            <select value={magnification} onChange={(event) => setMagnification(Number(event.currentTarget.value))}>
              {MAGNIFICATION_OPTIONS.map((value) => <option key={value} value={value}>×{value}</option>)}
            </select>
          </label>
          <label>
            <span>SEED</span>
            <div className="lab-seed-input">
              <input type="number" min="0" max="4294967295" step="1" value={seed} onChange={(event) => setSeed(Number(event.currentTarget.value))} />
              <button type="button" onClick={() => setSeed(createGameSeed())}>RANDOM</button>
            </div>
          </label>
          <label>
            <span>COUNT</span>
            <select value={count} onChange={(event) => setCount(Number(event.currentTarget.value))}>
              {LAB_COUNT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {algorithm === "boundary-element-offset" && (
            <label>
              <span>BOUNDARY RESOLUTION</span>
              <select value={boundaryResolution} onChange={(event) => setBoundaryResolution(Number(event.currentTarget.value))}>
                {BOUNDARY_RESOLUTION_OPTIONS.map((value) => <option key={value} value={value}>{value} elements / question width</option>)}
              </select>
            </label>
          )}
          {algorithm === "distance-visible" && (
            <label>
              <span>SCENE PALETTE</span>
              <select value={scenePalette} onChange={(event) => setScenePalette(event.currentTarget.value as MandelbrotPaletteId)}>
                {MANDELBROT_PALETTE_IDS.map((id) => <option key={id} value={id}>{id.toUpperCase()}</option>)}
              </select>
            </label>
          )}
          <button className="lab-generate" type="button" disabled={generating} onClick={generate}>
            {generating ? "GENERATING IN WORKER…" : "GENERATE"}
          </button>
        </div>
        <p className="lab-rule-note">
          {algorithm === "distance-visible"
            ? "Independent uniform anchors → exterior-potential projection → random viewport offset → calibrated image visibility. No previous-question or similarity weighting."
            : algorithm === "current"
            ? "Legacy 5×5 boundary-cell baseline. Duplicate detected cells are excluded by that baseline rule."
            : algorithm === "uniform-valid-viewport"
              ? "Uniform overview-center proposals; finite adaptive boundary-intersection approximation decides acceptance. No center snapping."
              : "Uniform finite boundary-element proposals; a uniform viewport offset is drawn and out-of-domain centers are rejected, never clipped."}
        </p>
        {error && <p className="lab-error" role="alert">{error}</p>}
      </section>

      <DatasetExportPanel
        algorithm={algorithm}
        magnification={magnification}
        seed={seed}
        boundaryResolution={boundaryResolution}
      />

      {result?.stats.scene && (
        <section className="lab-calibration-panel" aria-label="景観の校正画像">
          <div className="lab-section-heading">
            <div><span>QA</span><h2>SCENE VISIBILITY CALIBRATION</h2></div>
            <p>Variance &gt; {result.stats.scene.threshold.toExponential(6)} · full iterations · 192×120</p>
          </div>
          <div className="lab-calibration-grid">
            {SCENE_CALIBRATION_EXAMPLES.map((sample, index) => {
              const measurement = result.stats.scene?.calibration.find((row) => row.id === sample.id);
              return <figure key={sample.id} data-calibration-id={sample.id}>
                <LazyQuestionImage key={resultPalette} paletteId={resultPalette} label={`校正画像 ${sample.id}`} question={{
                  index, magnification: sample.zoom,
                  camera: { centerRe: sample.centerRe, centerIm: sample.centerIm, viewportWidth: questionViewportGeometry(sample.zoom).width },
                }} />
                <figcaption>{sample.id} · {sample.label} · V {measurement?.energy.toExponential(6)}</figcaption>
              </figure>;
            })}
          </div>
        </section>
      )}

      {result && selected ? (
        <div className="lab-workspace">
          <section className="lab-gallery-panel" aria-labelledby="gallery-title">
            <div className="lab-section-heading compact">
              <div><span>02</span><h2 id="gallery-title">GALLERY</h2></div>
              <p>{algorithmLabel(result.settings.algorithm)}</p>
            </div>
            <div className="lab-gallery">
              {result.questions.map((question) => (
                <button
                  type="button"
                  key={question.id}
                  data-question-id={question.id}
                  data-camera={JSON.stringify(question.camera)}
                  data-generation={question.debug.kind === "distance-visible" ? JSON.stringify(question.debug.generation) : undefined}
                  className={`lab-question-card ${question.index === selected.index ? "is-selected" : ""}`}
                  onClick={() => selectQuestion(question.index)}
                >
                  <LazyQuestionImage key={resultPalette} question={question} paletteId={resultPalette} />
                  <span className="lab-card-meta">
                    <b>#{question.index + 1}</b>
                    <em>×{question.magnification}</em>
                    <code>{formatComplex({ re: question.camera.centerRe, im: question.camera.centerIm }, question.magnification)}</code>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="lab-analysis-column">
            <section className="lab-overview-panel" aria-labelledby="overview-title">
              <div className="lab-section-heading compact">
                <div><span>03</span><h2 id="overview-title">OVERVIEW MAP</h2></div>
                <label className="lab-debug-toggle"><input type="checkbox" checked={showDebug} onChange={(event) => setShowDebug(event.currentTarget.checked)} /> DEBUG OVERLAY</label>
              </div>
              <OverviewMap
                result={result}
                selected={selected}
                answer={answer}
                guess={guess}
                showDebug={showDebug}
                onSelectQuestion={selectQuestion}
                onGuess={setGuess}
              />
            </section>

            <section className="lab-detail-panel" aria-labelledby="detail-title">
              <div className="lab-section-heading compact">
                <div><span>04</span><h2 id="detail-title">SELECTED QUESTION</h2></div>
                <div className="lab-detail-actions">
                  <p>#{selected.index + 1} · {algorithmLabel(selected.algorithm)}</p>
                  <button
                    type="button"
                    className="lab-export-png"
                    disabled={exportingPng}
                    onClick={exportScoringViewport}
                  >
                    {exportingPng ? "EXPORTING…" : "EXPORT PNG · 1280×800"}
                  </button>
                </div>
              </div>
              <div className="lab-detail-grid">
                <div className="lab-large-preview">
                  <FractalViewport
                    key={`${answer.re}-${answer.im}-${scoreMagnification}`}
                    initialCamera={scoringCamera}
                    paletteId={resultPalette}
                    interaction={FIXED_INTERACTION}
                    ariaLabel="選択問題のScoring viewport"
                  />
                  <span>SCORING VIEWPORT · ×{scoreMagnification}</span>
                </div>
                <div className="lab-question-data">
                  <dl className="lab-compact-data">
                    <div><dt>Source center</dt><dd>{formatComplex({ re: selected.camera.centerRe, im: selected.camera.centerIm }, selected.magnification)}</dd></div>
                    <div><dt>Magnification</dt><dd>×{selected.magnification}</dd></div>
                    <div><dt>Seed</dt><dd>{selected.seed}</dd></div>
                    <div><dt>Algorithm</dt><dd>{algorithmLabel(selected.algorithm)}</dd></div>
                  </dl>
                  {exportStatus && (
                    <p className="lab-export-status" aria-live="polite">
                      {exportStatus}
                    </p>
                  )}
                  <div className="lab-debug-summary"><h3>GENERATOR DEBUG</h3><DebugSummary question={selected} /></div>
                </div>
              </div>
            </section>

            <section className="lab-scoring-panel" aria-labelledby="scoring-title">
              <div className="lab-section-heading compact">
                <div><span>05</span><h2 id="scoring-title">SCORING EXPERIMENT</h2></div>
                <p>Map diagonal l = {mandelbrotOverviewDiagonal().toFixed(9)}</p>
              </div>
              <div className="lab-scoring-grid">
                <div className="lab-scoring-controls">
                  <fieldset><legend>ANSWER</legend>
                    <NumberField label="Re" value={answer.re} onChange={(re) => setAnswer((value) => ({ ...value, re }))} />
                    <NumberField label="Im" value={answer.im} onChange={(im) => setAnswer((value) => ({ ...value, im }))} />
                  </fieldset>
                  <fieldset><legend>GUESS</legend>
                    <NumberField label="Re" value={guess.re} onChange={(re) => setGuess((value) => ({ ...value, re }))} />
                    <NumberField label="Im" value={guess.im} onChange={(im) => setGuess((value) => ({ ...value, im }))} />
                  </fieldset>
                  <div className="lab-score-parameters">
                    <NumberField label="M" value={scoreMagnification} min={0.000001} onChange={setScoreMagnification} suffix="magnification" />
                    <NumberField label="HALF DISTANCE h" value={halfDistancePercent} min={0.000001} onChange={setHalfDistancePercent} suffix="% of map diagonal" />
                    <NumberField label="FULL SCORE TOLERANCE τ" value={tolerancePercent} min={0} onChange={setTolerancePercent} suffix="% of question diagonal" />
                  </div>
                </div>
                <div className="lab-score-output">
                  {scoring.value ? (
                    <>
                      <p className="lab-score"><span>SCORE</span><strong>{scoring.value.points.toLocaleString()}</strong><em>/ 5,000</em></p>
                      <dl>
                        <div><dt>Coordinate distance</dt><dd>d = {scoring.value.coordinateDistance.toExponential(8)}</dd></div>
                        <div><dt>Map-relative distance</dt><dd>d / l = {(scoring.value.mapRelativeDistance * 100).toFixed(8)} %</dd></div>
                        <div><dt>Question-relative distance</dt><dd>dM / l = {scoring.value.questionRelativeDistance.toFixed(8)} diagonals</dd></div>
                        <div><dt>Magnification</dt><dd>×{scoreMagnification}</dd></div>
                        <div><dt>Half distance</dt><dd>h = {halfDistancePercent.toFixed(4)} % of map diagonal</dd></div>
                        <div><dt>Full-score tolerance</dt><dd>τ = {tolerancePercent.toFixed(4)} % of question diagonal</dd></div>
                        <div><dt>K</dt><dd>{scoring.value.decayConstant.toFixed(6)}</dd></div>
                        <div><dt>Branch</dt><dd>{scoring.value.usedFullScoreTolerance ? "full-score tolerance" : "exponential decay"}</dd></div>
                      </dl>
                    </>
                  ) : <p className="lab-error">{scoring.error}</p>}
                </div>
              </div>
            </section>

            <section className="lab-statistics" aria-labelledby="statistics-title">
              <div className="lab-section-heading compact"><div><span>06</span><h2 id="statistics-title">GENERATOR STATISTICS</h2></div></div>
              <dl>
                <Stat label="Generated">{result.stats.generated}</Stat>
                <Stat label="Candidates tested">{result.stats.candidatesTested.toLocaleString()}</Stat>
                <Stat label="Accepted">{result.stats.accepted.toLocaleString()}</Stat>
                <Stat label="Rejected">{result.stats.rejected.toLocaleString()}</Stat>
                <Stat label="Generation time">{result.stats.generationTimeMs.toFixed(1)} ms</Stat>
              </dl>
              <p>{result.stats.detail}</p>
            </section>
          </div>
        </div>
      ) : (
        <section className="lab-empty-state">
          <span>NO SAMPLE SET</span>
          <p>Choose a finite sampling rule, then generate a reproducible batch.</p>
        </section>
      )}
    </main>
  );
}
