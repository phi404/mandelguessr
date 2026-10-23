import type { ReactNode } from "react";
import { FractalViewport } from "../fractal/FractalViewport";
import type { Camera, ViewportInteraction } from "../fractal/types";
import type { MandelbrotPaletteId } from "../fractal/mandelbrot-palettes";
import { GameHeader } from "./GameOverlays";
import { UiIcon } from "./UiIcon";
import type { CreationRequest, GamePhase } from "./game-session";
import {
  MAGNIFICATION_OPTIONS,
  MAX_MAGNIFICATION,
  MAX_ROUND_COUNT,
  MIN_MAGNIFICATION,
  MIN_ROUND_COUNT,
  ROUND_COUNT_OPTIONS,
  isValidMagnification,
  isValidRoundCount,
  type GameRules,
} from "./game-rules";

const BACKGROUND_INTERACTION: ViewportInteraction = {
  pan: false,
  zoom: false,
  select: false,
};

const SETUP_BACKGROUND_CAMERA: Camera = {
  centerRe: -0.72,
  centerIm: 0.04,
  viewportWidth: 2.75,
};

type SetupCommonProps = {
  paletteId: MandelbrotPaletteId;
  onHome: () => void;
  onMenu: () => void;
  overlays: ReactNode;
};

export function HomeScreen({
  paletteId,
  onHome,
  onMenu,
  onPlay,
  onExplore,
  overlays,
}: SetupCommonProps & {
  onPlay: () => void;
  onExplore: () => void;
}) {
  return (
    <main className="game-prototype setup-scene home-scene screen-enter">
      <GameHeader onHome={onHome} onMenu={onMenu} />
      <section className="home-stage">
        <div className="home-panel">
          <h1>この景色は、<br />どこにある？</h1>
          <p>形を頼りに、マンデルブロ集合を探索。</p>
          <div className="home-actions">
            <button className="primary-action" type="button" onClick={onPlay} title="位置当てゲームを開始"><UiIcon name="play" /><span>PLAY</span><UiIcon name="arrow" /></button>
            <button className="secondary-action" type="button" onClick={onExplore} title="自由に探索"><UiIcon name="compass" /><span>EXPLORE</span></button>
          </div>
        </div>
        <figure className="home-atlas">
          <div className="home-atlas-image">
            <FractalViewport initialCamera={SETUP_BACKGROUND_CAMERA} interaction={BACKGROUND_INTERACTION} paletteId={paletteId} ariaLabel="マンデルブロ集合の全体図" />
          </div>
          <figcaption><span className="live-dot" aria-hidden="true" />MANDELBROT</figcaption>
        </figure>
      </section>
      {overlays}
    </main>
  );
}

export function NewGameScreen({
  onHome,
  onMenu,
  overlays,
  gameRules,
  parsedMagnification,
  parsedRoundCount,
  magnificationInput,
  roundCountInput,
  magnificationIsValid,
  roundCountIsValid,
  rulesAreValid,
  settingsError,
  onMagnificationInput,
  onRoundCountInput,
  onRulesChange,
  onStart,
}: SetupCommonProps & {
  gameRules: GameRules;
  parsedMagnification: number;
  parsedRoundCount: number;
  magnificationInput: string;
  roundCountInput: string;
  magnificationIsValid: boolean;
  roundCountIsValid: boolean;
  rulesAreValid: boolean;
  settingsError: string | null;
  onMagnificationInput: (value: string) => void;
  onRoundCountInput: (value: string) => void;
  onRulesChange: (patch: Partial<GameRules>) => void;
  onStart: () => void;
}) {
  return (
    <main className="game-prototype setup-scene new-game-scene screen-enter">
      <GameHeader label="NEW GAME" onHome={onHome} onMenu={onMenu} />
      <section className="setup-stage">
        <form className="settings-card game-rules-card" onSubmit={(event) => { event.preventDefault(); onStart(); }}>
          <header className="setup-title"><span className="setup-symbol"><UiIcon name="settings" /></span><h1>ゲーム設定</h1></header>
          <section className="setting-group" aria-labelledby="magnification-label">
            <header className="setting-heading"><h2 id="magnification-label" title="出題画像の倍率。大きいほど狭い範囲が出題されます。"><UiIcon name="zoom" />倍率</h2><span>×{parsedMagnification || "—"}</span></header>
            <div className="preset-options target-zoom-presets" role="group" aria-label="TARGET倍率プリセット">
              {MAGNIFICATION_OPTIONS.map((value) => (
                <button key={value} className="preset-button" type="button" aria-pressed={parsedMagnification === value} onClick={() => { onMagnificationInput(String(value)); onRulesChange({ magnification: value }); }}>×{value}</button>
              ))}
            </div>
            <label className="number-setting compact-number-setting" htmlFor="custom-magnification">
              <span>カスタム</span><div><b aria-hidden="true">×</b><input id="custom-magnification" type="number" inputMode="decimal" min={MIN_MAGNIFICATION} max={MAX_MAGNIFICATION} step="any" value={magnificationInput} aria-invalid={!magnificationIsValid} onChange={(event) => { const value = event.currentTarget.value; const number = Number(value); onMagnificationInput(value); if (isValidMagnification(number)) onRulesChange({ magnification: number }); }} /></div>
            </label>
          </section>
          <section className="setting-group" aria-labelledby="round-count-label">
            <header className="setting-heading"><h2 id="round-count-label"><UiIcon name="target" />ラウンド</h2><span>{roundCountIsValid ? `${parsedRoundCount}問` : "—"}</span></header>
            <div className="preset-options round-presets" role="group" aria-label="ラウンド数プリセット">
              {ROUND_COUNT_OPTIONS.map((value) => (
                <button key={value} className="preset-button" type="button" aria-pressed={parsedRoundCount === value} onClick={() => { onRoundCountInput(String(value)); onRulesChange({ roundCount: value }); }}>{value}</button>
              ))}
            </div>
            <label className="number-setting compact-number-setting" htmlFor="custom-round-count">
              <span>カスタム</span><div><input id="custom-round-count" type="number" inputMode="numeric" min={MIN_ROUND_COUNT} max={MAX_ROUND_COUNT} step="1" value={roundCountInput} aria-invalid={!roundCountIsValid} onChange={(event) => { const value = event.currentTarget.value; const number = Number(value); onRoundCountInput(value); if (isValidRoundCount(number)) onRulesChange({ roundCount: number }); }} /><b aria-hidden="true">R</b></div>
            </label>
          </section>
          <div className="rule-toggle-grid">
            <section className="toggle-setting">
              <div><UiIcon name="move" /><h3 title="出題画像をドラッグして周辺を観察できます。">ターゲットの移動</h3></div>
              <label className="toggle-switch"><input type="checkbox" role="switch" aria-label="TARGETのパンを許可" checked={gameRules.questionPanAllowed} onChange={({ currentTarget: { checked } }) => onRulesChange({ questionPanAllowed: checked })} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
            </section>
            <section className="toggle-setting">
              <div><UiIcon name="zoom" /><h3 title="出題時の倍率から、さらにターゲットを拡大できます。">追加ズーム</h3></div>
              <label className="toggle-switch"><input type="checkbox" role="switch" aria-label="TARGETの追加拡大を許可" checked={gameRules.questionInspectAllowed} onChange={({ currentTarget: { checked } }) => onRulesChange({ questionInspectAllowed: checked })} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
            </section>
          </div>
          {settingsError && <p className="settings-error">{settingsError}</p>}
          <button className="primary-action start-game" type="submit" disabled={!rulesAreValid}><UiIcon name="play" />PLAY <UiIcon name="arrow" /></button>
        </form>
      </section>
      {overlays}
    </main>
  );
}

export function CreationScreen({
  phase,
  onHome,
  onMenu,
  overlays,
  creationError,
  lastCreation,
  onRetry,
  onNewGame,
}: SetupCommonProps & {
  phase: Extract<GamePhase, "creating" | "creation-error">;
  creationError: string | null;
  lastCreation: CreationRequest | null;
  onRetry: (request: CreationRequest) => void;
  onNewGame: () => void;
}) {
  return (
    <main className="game-prototype setup-scene creation-scene screen-enter">
      <GameHeader label={phase === "creating" ? "GENERATING" : "CREATE FAILED"} onHome={onHome} onMenu={onMenu} />
      <section className="creation-stage">
        {phase === "creating" ? (
          <div className="creating-status" role="status"><span className="creating-spinner" aria-hidden="true" /><strong>GENERATING</strong></div>
        ) : (
          <div className="creation-error-card" role="alert">
            <span>FAILED TO CREATE GAME</span>
            <p>{creationError}</p>
            <div>
              {lastCreation && <button className="primary-action" type="button" onClick={() => onRetry(lastCreation)}>RETRY</button>}
              <button className="secondary-action" type="button" onClick={onNewGame}>NEW GAME</button>
            </div>
          </div>
        )}
      </section>
      {overlays}
    </main>
  );
}
