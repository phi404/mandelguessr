"use client";

import { useEffect, useRef, useState } from "react";
import {
  MANDELBROT_PALETTES,
  MANDELBROT_PALETTE_IDS,
  samplePaletteRgb,
  type MandelbrotPaletteId,
} from "../fractal/mandelbrot-palettes";
import type { GamePhase } from "./game-session";
import type { UserSettings } from "./preferences";
import { downloadPlaytestData } from "./playtest-data";
import { copyShareResult, xShareIntent } from "./share-game";
import { UiIcon } from "./UiIcon";

function useDialogFocus(open: boolean) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]',
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
  return (
    <header className="game-header">
      <a
        className="game-brand"
        href={import.meta.env.BASE_URL}
        onClick={(event) => {
          event.preventDefault();
          onHome();
        }}
      >
        <span className="brand-symbol"><UiIcon name="fractal" /></span>MandelGuessr
      </a>
      <div className="header-actions">
        {label && <div className="round-indicator"><strong>{label}</strong></div>}
        <button
          className="icon-button game-menu-button"
          type="button"
          onClick={onMenu}
          aria-label="メニュー"
          title="メニュー"
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
  const dialogRef = useDialogFocus(open);
  if (!open) return null;
  const paused = phase === "play";

  return (
    <div className="menu-backdrop">
      <section ref={dialogRef} className="game-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="game-menu-title">
        <header>
          <h2 id="game-menu-title">{paused ? "PAUSED" : "MENU"}</h2>
          {gameLabel && <span>{gameLabel}</span>}
        </header>
        <button className="primary-action" type="button" onClick={onClose}>
          <UiIcon name={paused ? "play" : "close"} />{paused ? "RESUME" : "CLOSE"}
        </button>
        <div className="menu-separator" />
        <button className="secondary-action" type="button" disabled={phase === "home"} onClick={onHome}><UiIcon name="home" />HOME</button>
        <button className="secondary-action" type="button" disabled={phase === "new-game"} onClick={onNewGame}><UiIcon name="play" />NEW GAME</button>
        <button className="secondary-action" type="button" disabled={phase === "explore"} onClick={onExplore}><UiIcon name="compass" />EXPLORE</button>
        <div className="menu-separator" />
        <button className="secondary-action" type="button" onClick={onInformation}><UiIcon name="info" />INFORMATION</button>
        <button className="secondary-action" type="button" onClick={onSettings}><UiIcon name="settings" />SETTINGS</button>
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
  return (
    <section className="setting-group palette-setting" aria-labelledby="palette-label">
      <h3 className="visually-hidden" id="palette-label">パレット</h3>
      <div className="preset-options palette-presets" role="group" aria-label="公式パレット">
        {MANDELBROT_PALETTE_IDS.map((id) => (
          <button
            key={id}
            className={`preset-button palette-choice palette-${id}`}
            type="button"
            aria-pressed={paletteId === id}
            onClick={() => onSelect(id)}
          >
            <span aria-hidden="true" style={{ backgroundImage: `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, index) => `rgb(${samplePaletteRgb(id, index / 8).join(", ")}) ${index * 12.5}%`).join(", ")})` }} />
            {MANDELBROT_PALETTES[id].label}
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
  const dialogRef = useDialogFocus(open);
  if (!open) return null;
  return (
    <div className="menu-backdrop information-backdrop">
      <section ref={dialogRef} className="information-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="dialog-heading">
          <div>
            <h2 id="settings-title">配色</h2>
          </div>
          <button className="icon-button" type="button" onClick={onMenu} aria-label="メニュー" title="メニュー"><UiIcon name="menu" /></button>
        </header>
        <PaletteSelector paletteId={settings.paletteId} onSelect={onPalette} />
        <button className="primary-action" type="button" onClick={onClose}>CLOSE</button>
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
  const dialogRef = useDialogFocus(open);
  if (!open) return null;

  return (
    <div className="menu-backdrop information-backdrop">
      <section ref={dialogRef} className="information-dialog" role="dialog" aria-modal="true" aria-labelledby="information-title">
        <header className="dialog-heading">
          <h2 id="information-title">ガイド</h2>
          <button className="icon-button" type="button" onClick={onMenu} aria-label="メニュー" title="メニュー"><UiIcon name="menu" /></button>
        </header>
        <div className="information-sections">
          <details className="info-section" open>
            <summary><UiIcon name="play" />遊び方<UiIcon name="chevron" /></summary>
            <p>TARGETと同じ景色を探し、地点を選択して <code>GUESS</code>。正解に近いほど高得点です（最大5,000点）。</p>
            <p><code>EXPLORE</code> では自由に集合を探索できます。</p>
          </details>
          <details className="info-section">
            <summary><UiIcon name="move" />操作<UiIcon name="chevron" /></summary>
            <dl className="control-list">
              <div><dt>移動</dt><dd>ドラッグ</dd></div>
              <div><dt>ズーム</dt><dd>ホイール / ピンチ</dd></div>
              <div><dt>地点選択</dt><dd>クリック / タップ</dd></div>
              <div><dt>TARGET</dt><dd>タイトルバーをドラッグして移動。右上のボタンでウィンドウを拡大。</dd></div>
              <div><dt>ゲーム設定</dt><dd>「ターゲットの移動」と「追加ズーム」で、出題画像の操作を許可します。出題時より広く縮小することはできません。</dd></div>
            </dl>
          </details>
          <details className="info-section">
            <summary><UiIcon name="fractal" />マンデルブロ集合<UiIcon name="chevron" /></summary>
            <p className="mandelbrot-equation"><code>z₀ = 0, zₙ₊₁ = zₙ² + c</code></p>
            <p>この計算を繰り返したとき、数列が有界にとどまる複素数 <i>c</i> の集合です。拡大すると、異なる尺度に複雑な形が現れます。</p>
          </details>
          <details className="info-section">
            <summary><UiIcon name="info" />クレジット<UiIcon name="chevron" /></summary>
            <dl className="credits-list">
              <div><dt>制作</dt><dd>ふぁい.</dd></div>
              <div><dt>SOURCE CODE</dt><dd><a href="https://github.com/phi404/mandelguessr" target="_blank" rel="noreferrer">GitHub</a></dd></div>
            </dl>
            <p><a href="https://github.com/phi404/mandelguessr/blob/main/app/fractal/palettes/ATTRIBUTION.md" target="_blank" rel="noreferrer">パレットの出典・ライセンス</a></p>
          </details>
        </div>
        {debug && (
          <section className="playtest-data-panel">
            <div><strong>調整用データ</strong><span>この端末内のみ · {sampleCount}ラウンド</span></div>
            <div>
              <button className="text-action" type="button" disabled={sampleCount === 0} onClick={downloadPlaytestData}>書き出す</button>
              <button className="text-action" type="button" disabled={sampleCount === 0} onClick={onClearData}>消去</button>
            </div>
          </section>
        )}
        <button className="primary-action" type="button" onClick={onClose}>CLOSE</button>
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
  const [copyLabel, setCopyLabel] = useState("COPY RESULT");
  const dialogRef = useDialogFocus(true);

  return (
    <div className="menu-backdrop share-backdrop">
      <section ref={dialogRef} className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <header>
          <h2 id="share-title">SHARE RESULT</h2>
          <strong>{score}</strong>
          {secondary && <span>{secondary}</span>}
        </header>
        <button
          className="primary-action"
          type="button"
          onClick={() => window.open(xShareIntent(text), "_blank", "noopener,noreferrer")}
        >
          SHARE ON X
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={async () => setCopyLabel(await copyShareResult(text) ? "COPIED" : "COPY FAILED")}
        >
          {copyLabel}
        </button>
        <button className="text-action share-close" type="button" onClick={onClose}>CLOSE</button>
      </section>
    </div>
  );
}
