import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageProvider";
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
  centerRe: -0.55,
  centerIm: 0,
  viewportWidth: 4.6,
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
  const { t } = useLanguage();
  return (
    <main className="game-prototype setup-scene home-scene screen-enter">
      <GameHeader onHome={onHome} onMenu={onMenu} />
      <section className="home-stage" aria-labelledby="home-title">
        <div className="home-background" aria-hidden="true">
          <FractalViewport initialCamera={SETUP_BACKGROUND_CAMERA} interaction={BACKGROUND_INTERACTION} paletteId={paletteId} ariaLabel={t("overviewImage")} />
        </div>
        <div className="home-panel">
          <h1 id="home-title">MandelGuessr</h1>
          <div className="home-actions">
            <button className="primary-action" type="button" onClick={onPlay} title={t("startGame")}><UiIcon name="play" /><span>{t("play")}</span></button>
            <button className="secondary-action" type="button" onClick={onExplore} title={t("freeExplore")}><UiIcon name="compass" /><span>{t("explore")}</span></button>
          </div>
        </div>
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
  const { t } = useLanguage();
  return (
    <main className="game-prototype setup-scene new-game-scene screen-enter">
      <GameHeader label={t("newGame")} onHome={onHome} onMenu={onMenu} />
      <section className="setup-stage">
        <form className="settings-card game-rules-card" onSubmit={(event) => { event.preventDefault(); onStart(); }}>
          <header className="setup-title"><span className="setup-symbol"><UiIcon name="settings" /></span><h1>{t("gameSettings")}</h1></header>
          <section className="setting-group" aria-labelledby="magnification-label">
            <header className="setting-heading"><h2 id="magnification-label" title={t("magnificationHelp")}><UiIcon name="zoom" />{t("magnification")}</h2><span>×{parsedMagnification || "—"}</span></header>
            <div className="preset-options target-zoom-presets" role="group" aria-label={t("magnificationPresets")}>
              {MAGNIFICATION_OPTIONS.map((value) => (
                <button key={value} className="preset-button" type="button" aria-pressed={parsedMagnification === value} onClick={() => { onMagnificationInput(String(value)); onRulesChange({ magnification: value }); }}>×{value}</button>
              ))}
            </div>
            <label className="number-setting compact-number-setting" htmlFor="custom-magnification">
              <span>{t("custom")}</span><div><b aria-hidden="true">×</b><input id="custom-magnification" type="number" inputMode="decimal" min={MIN_MAGNIFICATION} max={MAX_MAGNIFICATION} step="any" value={magnificationInput} aria-invalid={!magnificationIsValid} onChange={(event) => { const value = event.currentTarget.value; const number = Number(value); onMagnificationInput(value); if (isValidMagnification(number)) onRulesChange({ magnification: number }); }} /></div>
            </label>
          </section>
          <section className="setting-group" aria-labelledby="round-count-label">
            <header className="setting-heading"><h2 id="round-count-label"><UiIcon name="target" />{t("rounds")}</h2><span>{roundCountIsValid ? t("roundCount", { count: parsedRoundCount }) : "—"}</span></header>
            <div className="preset-options round-presets" role="group" aria-label={t("roundPresets")}>
              {ROUND_COUNT_OPTIONS.map((value) => (
                <button key={value} className="preset-button" type="button" aria-pressed={parsedRoundCount === value} onClick={() => { onRoundCountInput(String(value)); onRulesChange({ roundCount: value }); }}>{value}</button>
              ))}
            </div>
            <label className="number-setting compact-number-setting" htmlFor="custom-round-count">
              <span>{t("custom")}</span><div><input id="custom-round-count" type="number" inputMode="numeric" min={MIN_ROUND_COUNT} max={MAX_ROUND_COUNT} step="1" value={roundCountInput} aria-invalid={!roundCountIsValid} onChange={(event) => { const value = event.currentTarget.value; const number = Number(value); onRoundCountInput(value); if (isValidRoundCount(number)) onRulesChange({ roundCount: number }); }} /><b aria-hidden="true">R</b></div>
            </label>
          </section>
          <div className="rule-toggle-grid">
            <section className="toggle-setting">
              <div><UiIcon name="move" /><h3 title={t("panHelp")}>{t("panTarget")}</h3></div>
              <label className="toggle-switch"><input type="checkbox" role="switch" aria-label={t("panAllowed")} checked={gameRules.questionPanAllowed} onChange={({ currentTarget: { checked } }) => onRulesChange({ questionPanAllowed: checked })} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
            </section>
            <section className="toggle-setting">
              <div><UiIcon name="zoom" /><h3 title={t("zoomHelp")}>{t("zoomTarget")}</h3></div>
              <label className="toggle-switch"><input type="checkbox" role="switch" aria-label={t("zoomAllowed")} checked={gameRules.questionInspectAllowed} onChange={({ currentTarget: { checked } }) => onRulesChange({ questionInspectAllowed: checked })} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
            </section>
          </div>
          {settingsError && <p className="settings-error">{t("settingsRange")}</p>}
          <button className="primary-action start-game" type="submit" disabled={!rulesAreValid}><UiIcon name="play" />{t("play")} <UiIcon name="arrow" /></button>
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
  const { t } = useLanguage();
  return (
    <main className="game-prototype setup-scene creation-scene screen-enter">
      <GameHeader label={phase === "creating" ? t("generating") : t("createFailedHeader")} onHome={onHome} onMenu={onMenu} />
      <section className="creation-stage">
        {phase === "creating" ? (
          <div className="creating-status" role="status"><span className="creating-spinner" aria-hidden="true" /><strong>{t("generating")}</strong></div>
        ) : (
          <div className="creation-error-card" role="alert">
            <span>{t("createFailed")}</span>
            <p>{t(creationError === "timeout" ? "generationTimeout" : creationError === "graphics-unavailable" ? "graphicsUnavailable" : "generationFailed")}</p>
            <div>
              {lastCreation && <button className="primary-action" type="button" onClick={() => onRetry(lastCreation)}>{t("retry")}</button>}
              <button className="secondary-action" type="button" onClick={onNewGame}>{t("newGame")}</button>
            </div>
          </div>
        )}
      </section>
      {overlays}
    </main>
  );
}
