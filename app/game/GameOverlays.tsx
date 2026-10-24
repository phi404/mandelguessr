"use client";

import { useEffect, useRef, useState } from "react";
import {
  MANDELBROT_PALETTE_IDS,
  samplePaletteRgb,
  type MandelbrotPaletteId,
} from "../fractal/mandelbrot-palettes";
import type { GamePhase } from "./game-session";
import type { UserSettings } from "./preferences";
import { downloadPlaytestData } from "./playtest-data";
import { copyShareResult, xShareIntent } from "./share-game";
import { UiIcon } from "./UiIcon";
import { useLanguage } from "../i18n/LanguageProvider";
import { LANGUAGE_OPTIONS, isLanguage, type MessageKey } from "../i18n/messages";

function useDialogFocus(open: boolean) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => {
      dialog.removeEventListener("keydown", trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLButtonElement>(".game-menu-button")?.focus();
    };
  }, [open]);
  return dialogRef;
}

export function GameHeader({
  label,
  onHome,
  onMenu,
}: {
  label?: string;
  onHome: () => void;
  onMenu: () => void;
}) {
  const { t } = useLanguage();
  return (
    <header className="game-header">
      <a
        className="game-brand"
        href={import.meta.env?.BASE_URL ?? "/mandelguessr/"}
        onClick={(event) => {
          event.preventDefault();
          onHome();
        }}
      >
        <img className="brand-symbol" src={`${import.meta.env?.BASE_URL ?? "/mandelguessr/"}mandelguessr.svg`} width="32" height="32" alt="" />MandelGuessr
      </a>
      <div className="header-actions">
        {label && <div className="round-indicator"><strong>{label}</strong></div>}
        <button
          className="icon-button game-menu-button"
          type="button"
          onClick={onMenu}
          aria-label={t("menu")}
          title={t("menu")}
        >
          <UiIcon name="menu" />
        </button>
      </div>
    </header>
  );
}

export function NavigationMenu({
  open,
  phase,
  gameLabel,
  onClose,
  onHome,
  onNewGame,
  onExplore,
  onInformation,
  onSettings,
}: {
  open: boolean;
  phase: GamePhase;
  gameLabel?: string;
  onClose: () => void;
  onHome: () => void;
  onNewGame: () => void;
  onExplore: () => void;
  onInformation: () => void;
  onSettings: () => void;
}) {
  const { t } = useLanguage();
  const dialogRef = useDialogFocus(open);
  if (!open) return null;
  const paused = phase === "play";

  return (
    <div className="menu-backdrop">
      <section ref={dialogRef} className="game-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="game-menu-title">
        <header>
          <h2 id="game-menu-title">{paused ? t("paused") : t("menuTitle")}</h2>
          {gameLabel && <span>{gameLabel}</span>}
        </header>
        <button className="primary-action" type="button" onClick={onClose}>
          <UiIcon name={paused ? "play" : "close"} />{paused ? t("resume") : t("close")}
        </button>
        <div className="menu-separator" />
        <button className="secondary-action" type="button" disabled={phase === "home"} onClick={onHome}><UiIcon name="home" />{t("home")}</button>
        <button className="secondary-action" type="button" disabled={phase === "new-game"} onClick={onNewGame}><UiIcon name="play" />{t("newGame")}</button>
        <button className="secondary-action" type="button" disabled={phase === "explore"} onClick={onExplore}><UiIcon name="compass" />{t("explore")}</button>
        <div className="menu-separator" />
        <button className="secondary-action" type="button" onClick={onInformation}><UiIcon name="info" />{t("navInformation")}</button>
        <button className="secondary-action" type="button" onClick={onSettings}><UiIcon name="settings" />{t("settings")}</button>
      </section>
    </div>
  );
}

export function PaletteSelector({
  paletteId,
  onSelect,
}: {
  paletteId: MandelbrotPaletteId;
  onSelect: (paletteId: MandelbrotPaletteId) => void;
}) {
  const { t } = useLanguage();
  return (
    <section className="setting-group palette-setting" aria-labelledby="palette-label">
      <h3 className="visually-hidden" id="palette-label">{t("paletteGroup")}</h3>
      <div className="preset-options palette-presets" role="group" aria-label={t("officialPalettes")}>
        {MANDELBROT_PALETTE_IDS.map((id) => (
          <button
            key={id}
            className={`preset-button palette-choice palette-${id}`}
            type="button"
            aria-pressed={paletteId === id}
            onClick={() => onSelect(id)}
          >
            <span aria-hidden="true" style={{ backgroundImage: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, index) => `rgb(${samplePaletteRgb(id, index / 8).join(", ")}) ${index * 12.5}%`).join(", ")})` }} />
            {t(`palette.${id}`)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function SettingsDialog({
  open,
  settings,
  onPalette,
  onClose,
  onMenu,
}: {
  open: boolean;
  settings: UserSettings;
  onPalette: (paletteId: MandelbrotPaletteId) => void;
  onClose: () => void;
  onMenu: () => void;
}) {
  const { t, language, setLanguage } = useLanguage();
  const dialogRef = useDialogFocus(open);
  if (!open) return null;
  return (
    <div className="menu-backdrop information-backdrop">
      <section ref={dialogRef} className="information-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="dialog-heading">
          <div>
            <h2 id="settings-title">{t("settings")}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onMenu} aria-label={t("menu")} title={t("menu")}><UiIcon name="menu" /></button>
        </header>
        <section className="settings-block" aria-labelledby="language-label">
          <h3 id="language-label">{t("language")}</h3>
          <select className="language-select" aria-labelledby="language-label" value={language} onChange={({ currentTarget }) => { if (isLanguage(currentTarget.value)) setLanguage(currentTarget.value); }}>
            {LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value} lang={option.value}>{option.label}</option>)}
          </select>
        </section>
        <section className="settings-block"><h3>{t("colors")}</h3><PaletteSelector paletteId={settings.paletteId} onSelect={onPalette} /></section>
        <button className="primary-action" type="button" onClick={onClose}>{t("close")}</button>
      </section>
    </div>
  );
}

export function InformationDialog({
  open,
  debug,
  sampleCount,
  onClose,
  onMenu,
  onClearData,
}: {
  open: boolean;
  debug: boolean;
  sampleCount: number;
  onClose: () => void;
  onMenu: () => void;
  onClearData: () => void;
}) {
  const { t } = useLanguage();
  const dialogRef = useDialogFocus(open);
  if (!open) return null;

  return (
    <div className="menu-backdrop information-backdrop">
      <section ref={dialogRef} className="information-dialog" role="dialog" aria-modal="true" aria-labelledby="information-title">
        <header className="dialog-heading">
          <h2 id="information-title">{t("information")}</h2>
          <button className="icon-button" type="button" onClick={onMenu} aria-label={t("menu")} title={t("menu")}><UiIcon name="menu" /></button>
        </header>
        <div className="information-sections">
          <details className="info-section" open>
            <summary><UiIcon name="compass" />{t("mandelbrot")}<UiIcon name="chevron" /></summary>
            <div className="mandelbrot-guide">
              <section>
                <h3>{t("mandelbrotShapeTitle")}</h3>
                <p>{t("mandelbrotAppearance")}</p>
              </section>
              <section>
                <h3>{t("mandelbrotFractalTitle")}</h3>
                <p>{t("mandelbrotFractal")}</p>
                <p>{t("mandelbrotSimilarity")}</p>
              </section>
              <section>
                <h3>{t("mandelbrotRuleTitle")}</h3>
                <p>{t("mandelbrotPlane")}</p>
                <p>{t("mandelbrotIteration")}</p>
                <p className="mandelbrot-equation"><code>z₀ = 0, zₙ₊₁ = zₙ² + c</code></p>
                <p>{t("mandelbrotDefinition")}</p>
                <dl className="mandelbrot-examples">
                  <div><dt><code>c = 0</code></dt><dd>{t("exampleZero")}</dd></div>
                  <div><dt><code>c = −1</code></dt><dd>{t("exampleMinusOne")}</dd></div>
                  <div><dt><code>c = 1</code></dt><dd>{t("exampleOne")}</dd></div>
                </dl>
              </section>
              <section>
                <h3>{t("mandelbrotColorsTitle")}</h3>
                <p>{t("mandelbrotColors")}</p>
              </section>
              <p className="guide-reference">{t("furtherReading")}: <a href="https://plus.maths.org/unveiling-mandelbrot-set" target="_blank" rel="noreferrer">Robert Devaney — Unveiling the Mandelbrot set</a></p>
            </div>
          </details>
          <details className="info-section">
            <summary><UiIcon name="play" />{t("howToPlay")}<UiIcon name="chevron" /></summary>
            <p>{t("howToPlayText")}</p>
            <p>{t("distanceExplanation")}</p>
            <p>{t("howToExplore")}</p>
          </details>
          <details className="info-section">
            <summary><UiIcon name="move" />{t("controls")}<UiIcon name="chevron" /></summary>
            <dl className="control-list">
              <div><dt>{t("move")}</dt><dd>{t("drag")}</dd></div>
              <div><dt>{t("zoom")}</dt><dd>{t("wheelPinch")}</dd></div>
              <div><dt>{t("selectLocation")}</dt><dd>{t("clickTap")}</dd></div>
              <div><dt>{t("targetCaption")}</dt><dd>{t("windowControl")}</dd></div>
              <div><dt>{t("gameSettings")}</dt><dd>{t("rulesControl")}</dd></div>
            </dl>
          </details>
          <details className="info-section">
            <summary><UiIcon name="info" />{t("credits")}<UiIcon name="chevron" /></summary>
            <dl className="credits-list">
              <div><dt>{t("creator")}</dt><dd>ふぁい.</dd></div>
              <div><dt>{t("sourceCode")}</dt><dd><a href="https://github.com/phi404/mandelguessr" target="_blank" rel="noreferrer">GitHub</a></dd></div>
            </dl>
            <p><a href="https://github.com/phi404/mandelguessr/blob/main/app/fractal/palettes/ATTRIBUTION.md" target="_blank" rel="noreferrer">{t("paletteCredits")}</a></p>
          </details>
        </div>
        {debug && (
          <section className="playtest-data-panel">
            <div><strong>{t("localData")}</strong><span>{t("localDataCount", { count: sampleCount })}</span></div>
            <div>
              <button className="text-action" type="button" disabled={sampleCount === 0} onClick={downloadPlaytestData}>{t("export")}</button>
              <button className="text-action" type="button" disabled={sampleCount === 0} onClick={onClearData}>{t("clear")}</button>
            </div>
          </section>
        )}
        <button className="primary-action" type="button" onClick={onClose}>{t("close")}</button>
      </section>
    </div>
  );
}

export function ShareDialog({
  score,
  secondary,
  text,
  onClose,
}: {
  score: string;
  secondary?: string;
  text: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [copyLabel, setCopyLabel] = useState<MessageKey>("copyResult");
  const dialogRef = useDialogFocus(true);

  return (
    <div className="menu-backdrop share-backdrop">
      <section ref={dialogRef} className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <header>
          <h2 id="share-title">{t("shareResult")}</h2>
          <strong>{score}</strong>
          {secondary && <span>{secondary}</span>}
        </header>
        <button
          className="primary-action"
          type="button"
          onClick={() => window.open(xShareIntent(text), "_blank", "noopener,noreferrer")}
        >
          {t("shareOnX")}
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={async () => setCopyLabel(await copyShareResult(text) ? "copied" : "copyFailed")}
        >
          {t(copyLabel)}
        </button>
        <button className="text-action share-close" type="button" onClick={onClose}>{t("close")}</button>
      </section>
    </div>
  );
}
