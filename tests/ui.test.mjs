import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { importTypeScriptModule } from "./helpers/import-typescript-module.mjs";

const { LanguageProvider } = await importTypeScriptModule("../app/i18n/LanguageProvider.tsx");
const { HomeScreen, CreationScreen } = await importTypeScriptModule("../app/game/SetupScreens.tsx");
const { SettingsDialog, InformationDialog } = await importTypeScriptModule("../app/game/GameOverlays.tsx");
const { RoundResultScreen, FinalResultScreen } = await importTypeScriptModule("../app/game/ResultScreens.tsx");
const { ExploreScreen } = await importTypeScriptModule("../app/game/ExploreScreen.tsx");
const { messages, translate, loadLanguage, saveLanguage, LANGUAGE_STORAGE_KEY, LANGUAGES, LANGUAGE_OPTIONS } = await importTypeScriptModule("../app/i18n/messages.ts");
const { formatShareResult } = await importTypeScriptModule("../app/game/share-game.ts");

const noop = () => {};
const common = { paletteId: "classic", onHome: noop, onMenu: noop, overlays: null };
function render(Component, language, props) {
  return renderToStaticMarkup(createElement(LanguageProvider, { initialLanguage: language }, createElement(Component, props)));
}

test("all languages keep a title-only home with the original navigation", () => {
  for (const language of LANGUAGES) {
    const html = render(HomeScreen, language, { ...common, onPlay: noop, onExplore: noop });
    assert.match(html, /<h1 id="home-title">MandelGuessr<\/h1>/);
    assert.ok(!html.includes(messages[language].homeDescription));
    assert.doesNotMatch(html, /<p[ >]/);
    assert.ok(html.includes(`aria-label="${messages[language].menu}"`));
    assert.match(html, /src="\/mandelguessr\/mandelguessr.svg"/);
    assert.doesNotMatch(html, /この景色は|どこにある|MANDELBROT<\/figcaption>/);
  }
});

function record(distance, id = "round", magnification = 30) {
  return {
    question: { id, camera: { centerRe: -0.75, centerIm: 0.125, viewportWidth: 3.6 / magnification }, magnification },
    guess: { re: -0.75 + distance, im: 0.125 },
    score: { points: 2000, maximum: 5000, coordinateDistance: distance, normalizedDistance: 9876.54321 },
  };
}

test("round results lead with score and expose raw distance and both coordinates", () => {
  for (const language of LANGUAGES) {
    const html = render(RoundResultScreen, language, {
      ...common, record: record(0.25), roundIndex: 0, totalRounds: 2,
      isLastRound: false, debug: false, onFeedback: noop, onContinue: noop,
    });
    assert.match(html, /<strong>0\.25<\/strong>/);
    assert.match(html, /<dd>-0\.5000000 \+ 0\.1250000i<\/dd>/);
    assert.match(html, /<dd>-0\.7500000 \+ 0\.1250000i<\/dd>/);
    assert.ok(html.includes(messages[language].distanceError));
    assert.ok(html.indexOf('class="result-score"') < html.indexOf('class="result-metrics"'));
    assert.match(html, /class="result-map is-revealing"/);
    assert.doesNotMatch(html, /9876|画像対角線|screen diagonal|<details class="result-coordinates"/);
  }
});

test("total results lead with score and keep mean coordinate distance secondary", () => {
  const records = [record(0.25, "a", 30), record(0.75, "b", 10000)];
  for (const language of LANGUAGES) {
    const html = render(FinalResultScreen, language, {
      ...common, records, selectedBreakdown: 0, totalScore: 4000, averageScore: 2000,
      gameRules: { magnification: 30, roundCount: 2, questionPanAllowed: false, questionInspectAllowed: false },
      onSelectRound: noop, onPlayAgain: noop, onShare: noop, onNewGame: noop, shareDialog: null,
    });
    assert.match(html, /<h2 class="total-score">/);
    assert.match(html, /class="mean-distance"[^>]*>[^<]*<strong>0\.5<\/strong>/);
    assert.ok(html.indexOf('class="total-score"') < html.indexOf('class="mean-distance"'));
    assert.doesNotMatch(html, /is-revealing/);
    assert.ok(html.includes(messages[language].averageDistance));
    assert.ok(html.includes((4000).toLocaleString(language)));
    assert.match(html, /<dd>-0\.5000000 \+ 0\.1250000i<\/dd>/);
    assert.doesNotMatch(html, /9876|画像対角線|screen diagonal/);
  }
});

test("settings keep native language names and the guide introduces shape before its definition", () => {
  for (const language of LANGUAGES) {
    const settings = render(SettingsDialog, language, {
      open: true, settings: { paletteId: "classic" }, onPalette: noop, onClose: noop, onMenu: noop,
    });
    assert.match(settings, /lang="ja"/);
    assert.match(settings, /lang="en"/);
    assert.match(settings, /日本語/);
    assert.match(settings, /English/);
    assert.ok(settings.includes(messages[language].language));
    for (const option of LANGUAGE_OPTIONS) assert.ok(settings.includes(`value="${option.value}"`));
    const guide = render(InformationDialog, language, { open: true, debug: false, sampleCount: 0, onClose: noop, onMenu: noop, onClearData: noop });
    for (const key of ["mandelbrotAppearance", "mandelbrotFractal", "mandelbrotSimilarity", "mandelbrotPlane", "mandelbrotDefinition", "exampleZero", "exampleMinusOne", "exampleOne", "mandelbrotColors"]) {
      assert.ok(guide.includes(messages[language][key]), key);
    }
    assert.ok(guide.indexOf(messages[language].mandelbrotAppearance) < guide.indexOf(messages[language].mandelbrotFractal));
    assert.ok(guide.indexOf(messages[language].mandelbrotFractal) < guide.indexOf(messages[language].mandelbrotDefinition));
    assert.ok(guide.indexOf(messages[language].mandelbrotDefinition) < guide.indexOf(messages[language].mandelbrotColors));
  }
});

test("exploration coordinates use the current view center at high zoom", () => {
  const html = render(ExploreScreen, "en", {
    ...common, viewportRef: { current: null }, view: { centerRe: -0.743643887, centerIm: 0.131825904, zoom: 10000 },
    zoomLimits: { min: 0.7, max: 40000 }, onViewChange: noop,
  });
  assert.match(html, /Coordinates at the center of the view/);
  assert.match(html, /-0\.7436438870 \+ 0\.1318259040i/);
  assert.doesNotMatch(html, /class="explore-center"|>Center</);
});

test("language choice survives reload and tolerates unavailable or invalid storage", () => {
  const previous = globalThis.window;
  const storage = new Map([["mandelguessr.user-settings.v1", '{"paletteId":"retro"}']]);
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    assert.equal(loadLanguage(), "ja");
    saveLanguage("en");
    assert.equal(loadLanguage(), "en");
    assert.equal(storage.get("mandelguessr.user-settings.v1"), '{"paletteId":"retro"}');
    storage.set(LANGUAGE_STORAGE_KEY, "unsupported-language");
    assert.equal(loadLanguage(), "ja");
    globalThis.window.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    assert.equal(loadLanguage(), "ja");
    assert.doesNotThrow(() => saveLanguage("en"));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("translations cover both languages and resolve every interpolation", () => {
  for (const language of LANGUAGES) assert.deepEqual(Object.keys(messages[language]).sort(), Object.keys(messages.ja).sort());
  for (const language of LANGUAGES) {
    for (const key of Object.keys(messages[language])) {
      assert.doesNotMatch(translate(language, key, { count: 2, current: 1, total: 2, round: 1, state: "ON" }), /\{\w+\}/);
    }
  }
  assert.equal(translate("en", "roundCount", { count: 1 }), "1 round");
  assert.equal(translate("en", "roundCount", { count: 2 }), "2 rounds");
  assert.equal(translate("es", "roundCount", { count: 1 }), "1 ronda");
  assert.equal(translate("fr", "roundCount", { count: 1 }), "1 manche");
  assert.equal(translate("de", "roundCount", { count: 1 }), "1 Runde");
  assert.equal(translate("pt-BR", "roundCount", { count: 1 }), "1 rodada");
});

test("generation failures stay readable in the selected language", () => {
  for (const language of LANGUAGES) {
    for (const [code, key] of [["timeout", "generationTimeout"], ["graphics-unavailable", "graphicsUnavailable"], ["generation-failed", "generationFailed"]]) {
      const html = render(CreationScreen, language, { ...common, phase: "creation-error", creationError: code, lastCreation: null, onRetry: noop, onNewGame: noop });
      assert.ok(html.includes(messages[language][key]));
      assert.ok(html.includes(messages[language].newGame));
    }
  }
});

test("shared results use the selected language and average raw coordinate distances", () => {
  for (const language of LANGUAGES) {
    const text = formatShareResult({
      language, scores: [record(0.25).score, record(0.75).score],
      rules: { magnification: 30, roundCount: 2, questionPanAllowed: false, questionInspectAllowed: false },
      homeUrl: "https://phi404.github.io/mandelguessr/",
    });
    assert.ok(text.includes(`${messages[language].averageDistance} 0.5`));
    assert.match(text, /2 ROUNDS/);
    assert.doesNotMatch(text, /9876|画像対角線|screen diagonal|centerRe|centerIm/);
  }
});


test("original English control labels stay unchanged in all eight languages", () => {
  const expected = {
    play: "PLAY", explore: "EXPLORE", guessAction: "GUESS", guess: "GUESS", target: "TARGET",
    menuTitle: "MENU", paused: "PAUSED", resume: "RESUME", close: "CLOSE", home: "HOME",
    newGame: "NEW GAME", navInformation: "INFORMATION", settings: "SETTINGS",
    roundScore: "ROUND SCORE", totalScore: "TOTAL SCORE", averageScore: "AVG",
    result: "RESULT", nextRound: "NEXT ROUND", playAgain: "PLAY AGAIN",
    shareResult: "SHARE RESULT", copyResult: "COPY RESULT", shareOnX: "SHARE ON X",
    generating: "GENERATING", retry: "RETRY", "palette.classic": "CLASSIC", "palette.scientific": "SCIENTIFIC",
  };
  assert.equal(LANGUAGES.length, 8);
  for (const language of LANGUAGES) {
    for (const [key, text] of Object.entries(expected)) assert.equal(translate(language, key), text, language + ":" + key);
    const home = render(HomeScreen, language, { ...common, onPlay: noop, onExplore: noop });
    assert.match(home, />PLAY<\/span>/);
    assert.match(home, />EXPLORE<\/span>/);
  }
});
