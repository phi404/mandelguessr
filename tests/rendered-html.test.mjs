import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importTypeScriptModule } from "./helpers/import-typescript-module.mjs";

test("static entry serves assets under the GitHub Pages project path", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<title>MandelGuessr<\/title>/);
  assert.match(html, /https:\/\/phi404\.github\.io\/mandelguessr\//);
  assert.match(html, /href="\/mandelguessr\/mandelguessr\.svg"/);
  const assets = [...html.matchAll(/(?:src|href)="(\/mandelguessr\/assets\/[^"]+)"/g)];
  assert.ok(assets.length >= 2, "entry JS and CSS must be emitted");
  for (const [, asset] of assets) {
    await readFile(new URL("../dist/" + asset.slice("/mandelguessr/".length), import.meta.url));
  }
});

test("production contains the question worker and excludes Generator Lab", async () => {
  const directory = fileURLToPath(new URL("../dist/assets", import.meta.url));
  const files = await readdir(directory);
  assert.ok(files.some(file => /^question-generator\.worker-.*\.js$/.test(file)));
  const bundle = (await Promise.all(files.filter(file => file.endsWith(".js")).map(file => readFile(join(directory, file), "utf8")))).join("\n");
  assert.match(bundle, /\/mandelguessr\/assets\/question-generator\.worker-/);
  assert.doesNotMatch(bundle, /Generator Lab|DATASET EXPORT|next\/|chatgpt\.site|file:\/\/\/ROOT/);
});

test("preserves public UI, persistence, and safety contracts across module moves", async () => {
  const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));
  const sourceFiles = (await readdir(appDirectory, { recursive: true }))
    .filter((path) => /\.(?:ts|tsx)$/.test(path));
  const appSource = (
    await Promise.all(
      sourceFiles.map((path) => readFile(join(appDirectory, path), "utf8")),
    )
  ).join("\n");
  const [preferences, telemetry, sharing, workerClient, css] = await Promise.all([
    readFile(new URL("../app/game/preferences.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/playtest-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/share-game.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/question-generator-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const phase of [
    "home",
    "new-game",
    "creating",
    "creation-error",
    "explore",
    "play",
    "round-result",
    "final-result",
  ]) {
    assert.match(appSource, new RegExp(`"${phase}"`));
  }

  assert.match(appSource, /role="switch"/);
  assert.match(appSource, /className="exploration-frame"/);
  assert.match(appSource, /result-connection/);
  assert.match(appSource, /fixedCenter=/);
  assert.match(appSource, /renderer-error/);
  assert.match(appSource, /再試行/);
  assert.doesNotMatch(
    appSource,
    /questionProfile|QuestionProfile|Guess this point|Score pending|Not defined yet|SHARE ROUND|SEED \$\{gameSeed\}/,
  );

  assert.match(preferences, /mandelguessr\.settings\.v1/);
  assert.match(preferences, /mandelguessr\.game-rules\.v1/);
  assert.match(preferences, /mandelguessr\.user-settings\.v1/);
  assert.match(telemetry, /mandelguessr\.playtest\.v1/);
  assert.match(telemetry, /SCHEMA_VERSION = 5/);
  assert.match(telemetry, /MAX_SAMPLES = 500/);
  assert.doesNotMatch(telemetry, /fetch\(/);
  assert.match(sharing, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(
    sharing,
    /\bpaletteId\b|\bseed\b|generatorVersion|centerRe|centerIm|URLSearchParams/i,
  );
  assert.match(workerClient, /question-generator\.worker\.ts\?worker/);
  assert.doesNotMatch(workerClient, /new URL\(/);
  assert.match(workerClient, /worker\.terminate\(\)/);

  assert.match(css, /\.floating-window-content[\s\S]*?aspect-ratio:\s*8 \/ 5/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(
    css,
    /\.floating-question-window:not\(\.is-ready\)[\s\S]*visibility:\s*hidden/,
  );
});

test("boundary-cell selection is reproducible, global, and technically valid", async () => {
  const { buildRoundQuestions, isDetectedBoundaryCell } = await importTypeScriptModule(
    "../app/game/question-generator.ts",
  );

  for (const magnification of [10, 30, 75, 300, 1000, 3000, 10000]) {
    const settings = {
      magnification,
      roundCount: 10,
      questionPanAllowed: false,
    };
    const first = buildRoundQuestions(settings, 123456);
    const repeated = buildRoundQuestions(settings, 123456);
    const alternate = buildRoundQuestions(settings, 654321);

    assert.equal(first.length, 10);
    assert.deepEqual(
      first.map((question) => question.id),
      repeated.map((question) => question.id),
    );
    assert.notDeepEqual(
      first.map((question) => question.id),
      alternate.map((question) => question.id),
    );
    assert.equal(
      new Set(first.map((question) => `${question.boundaryCell.column}:${question.boundaryCell.row}`)).size,
      first.length,
    );

    for (const question of first) {
      const { column, row, gridSize } = question.boundaryCell;
      const cellWidth = 3.6 / gridSize;
      const cellHeight = (3.6 / 1.6) / gridSize;
      const left = -0.55 - 3.6 / 2 + column * cellWidth;
      const bottom = -(3.6 / 1.6) / 2 + row * cellHeight;
      assert.equal(gridSize, Math.ceil(magnification));
      assert.equal(question.camera.viewportWidth, 3.6 / magnification);
      assert.ok(question.camera.centerRe >= left && question.camera.centerRe <= left + cellWidth);
      assert.ok(question.camera.centerIm >= bottom && question.camera.centerIm <= bottom + cellHeight);
      assert.equal(isDetectedBoundaryCell(question.boundaryCell, magnification), true);
      assert.equal("quality" in question, false);
      assert.equal("profile" in question, false);
    }
  }

  for (const magnification of [10, 10000]) {
    const longGame = buildRoundQuestions({
      magnification,
      roundCount: 20,
      questionPanAllowed: true,
    }, 20260815);
    assert.equal(longGame.length, 20);
    assert.equal(new Set(longGame.map((question) => question.id)).size, 20);
  }
});

test("scoring is monotonic and invariant to magnification and position", async () => {
  const { MAX_ROUND_SCORE, scoreFromNormalizedDistance, scoreGuess } = await importTypeScriptModule(
    "../app/game/score-guess.ts",
  );
  const answer = { re: -0.75, im: 0.1 };
  const camera = { ...answer, centerRe: answer.re, centerIm: answer.im, viewportWidth: 0.35 };
  const diagonal = Math.hypot(camera.viewportWidth, camera.viewportWidth / 1.6);

  assert.equal(scoreGuess(camera, answer, answer).points, MAX_ROUND_SCORE);

  const normalizedDistances = [0.05, 0.2, 0.65, 1.5, 3];
  const points = normalizedDistances.map((distance) =>
    scoreGuess(
      camera,
      { re: answer.re + distance * diagonal, im: answer.im },
      answer,
    ).points,
  );
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
  assert.equal(scoreFromNormalizedDistance(0), 5000);
  assert.equal(scoreFromNormalizedDistance(1), 2500);
  assert.equal(scoreFromNormalizedDistance(2), 1250);
  assert.equal(scoreFromNormalizedDistance(3), 625);
  assert.equal(points[2], Math.round(5000 * 2 ** -0.65));
  assert.ok(points.at(-1) < 1000);

  const deepCamera = { ...camera, viewportWidth: camera.viewportWidth / 30 };
  const deepDiagonal = Math.hypot(
    deepCamera.viewportWidth,
    deepCamera.viewportWidth / 1.6,
  );
  const shallowScore = scoreGuess(
    camera,
    { re: answer.re + 0.4 * diagonal, im: answer.im },
    answer,
  );
  const deepScore = scoreGuess(
    deepCamera,
    { re: answer.re + 0.4 * deepDiagonal, im: answer.im },
    answer,
  );
  assert.equal(shallowScore.points, deepScore.points);
  assert.ok(
    Math.abs(
      shallowScore.normalizedDistance - deepScore.normalizedDistance,
    ) < 1e-12,
  );

  const translatedAnswer = { re: 0.2, im: -0.6 };
  const translatedCamera = {
    centerRe: translatedAnswer.re,
    centerIm: translatedAnswer.im,
    viewportWidth: camera.viewportWidth,
  };
  const translatedScore = scoreGuess(
    translatedCamera,
    { re: translatedAnswer.re + 0.4 * diagonal, im: translatedAnswer.im },
    translatedAnswer,
  );
  assert.equal(shallowScore.points, translatedScore.points);
});

test("exploration zoom limits scale with the selected question", async () => {
  const { explorationZoomLimit } = await importTypeScriptModule(
    "../app/game/game-rules.ts",
  );

  assert.equal(explorationZoomLimit(10), 40);
  assert.equal(explorationZoomLimit(30), 120);
  assert.equal(explorationZoomLimit(1000), 4000);
  assert.equal(explorationZoomLimit(10000), 40000);
  assert.equal(explorationZoomLimit(20000), 40000);
});

test("Generator Lab CURRENT retains the boundary-grid baseline and every CPU rule is reproducible", async () => {
  const { generateLabQuestions } = await importTypeScriptModule(
    "../app/generator-lab/generator-lab.ts",
  );
  const { buildRoundQuestions } = await importTypeScriptModule(
    "../app/game/question-generator.ts",
  );
  const base = {
    magnification: 30,
    seed: 246813579,
    count: 4,
    boundaryResolution: 2,
  };
  const production = buildRoundQuestions({
    magnification: base.magnification,
    roundCount: base.count,
    questionPanAllowed: false,
  }, base.seed);
  const current = generateLabQuestions({ ...base, algorithm: "current" });

  assert.deepEqual(
    current.questions.map(({ id, camera }) => ({ id, camera })),
    production.map(({ id, camera }) => ({ id, camera })),
  );

  for (const algorithm of [
    "current",
    "uniform-valid-viewport",
    "boundary-element-offset",
  ]) {
    const first = generateLabQuestions({ ...base, algorithm });
    const repeated = generateLabQuestions({ ...base, algorithm });
    assert.deepEqual(first.questions, repeated.questions);
    assert.equal(first.questions.length, base.count);
    assert.equal(first.stats.generated, base.count);
    assert.equal(first.stats.accepted, base.count);
    assert.ok(first.stats.candidatesTested >= base.count);
  }
});

test("Generator Lab scoring follows h and tau definitions", async () => {
  const { mandelbrotOverviewDiagonal, questionViewportGeometry } =
    await importTypeScriptModule("../app/fractal/mandelbrot-domain.ts");
  const { scoreLabGuess } = await importTypeScriptModule(
    "../app/game/score-guess.ts",
  );
  const answer = { re: -0.75, im: 0.1 };
  const overviewDiagonal = mandelbrotOverviewDiagonal();
  const magnification = 100;

  assert.equal(scoreLabGuess(answer, answer, magnification, 0.01, 0).points, 5000);
  assert.equal(
    scoreLabGuess(
      { re: answer.re + overviewDiagonal * 0.01, im: answer.im },
      answer,
      magnification,
      0.01,
      0,
    ).points,
    2500,
  );
  assert.equal(
    scoreLabGuess(
      { re: answer.re + (overviewDiagonal / magnification) * 0.02, im: answer.im },
      answer,
      magnification,
      0.01,
      0.02,
    ).points,
    5000,
  );
  const beyondTolerance = scoreLabGuess(
    { re: answer.re + (overviewDiagonal / magnification) * 0.021, im: answer.im },
    answer,
    magnification,
    0.01,
    0.02,
  );
  assert.equal(beyondTolerance.usedFullScoreTolerance, false);

  const points = [0, 0.002, 0.01, 0.03].map((relativeDistance) =>
    scoreLabGuess(
      { re: answer.re + overviewDiagonal * relativeDistance, im: answer.im },
      answer,
      magnification,
      0.01,
      0,
    ).points,
  );
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
  assert.throws(() => scoreLabGuess(answer, answer, magnification, 0, 0));
  assert.throws(() => scoreLabGuess(answer, answer, magnification, 0.01, -0.1));
  assert.ok(
    Math.abs(
      questionViewportGeometry(magnification).diagonal -
        overviewDiagonal / magnification,
    ) < 1e-15,
  );
});

test("Renderer Spec v1 fixes the official smooth-index pipeline", async () => {
  const domain = await importTypeScriptModule(
    "../app/fractal/mandelbrot-domain.ts",
  );
  const { fastFragmentShaderSource, preciseFragmentShaderSource } =
    await importTypeScriptModule("../app/fractal/mandelbrot-shaders.ts");

  assert.equal(domain.MANDELBROT_RENDERER_SPEC_VERSION, "mandelbrot-renderer-v1");
  assert.equal(domain.MANDELBROT_POWER, 2);
  assert.equal(domain.MANDELBROT_FORMULA_BAILOUT_SQUARED, 10_000);
  assert.equal(domain.MANDELBROT_SMOOTH_BAILOUT, 128);
  assert.equal(domain.MANDELBROT_SMOOTH_INDEX_SCALE, 0.05);
  assert.equal(domain.MANDELBROT_COLOR_DENSITY, 0.42);
  assert.deepEqual(
    [1, 10, 100, 1_000, 10_000, 100_000].map(
      domain.fullQualityIterationsForZoom,
    ),
    [500, 840, 1460, 2360, 3540, 5000],
  );

  for (const source of [fastFragmentShaderSource, preciseFragmentShaderSource]) {
    assert.match(source, /magnitudeSquared > FORMULA_BAILOUT_SQUARED/);
    assert.match(source, /log\(log\(SMOOTH_BAILOUT\)\)/);
    assert.match(source, /float densityIndex = COLOR_DENSITY \* smoothIndex/);
    assert.match(source, /float transferredIndex = log\(1\.0 \+ densityIndex\)/);
    assert.match(source, /return transferredIndex - floor\(transferredIndex\)/);
    assert.doesNotMatch(source, /(?:return|=)\s+fract\(/);
    assert.match(source, /outColor = vec4\(0\.0, 0\.0, 0\.0, 1\.0\)/);
    assert.match(source, /texture\(u_palette/);
    assert.doesNotMatch(source, /log10|exposure|gamma|saturation|histogram/);
  }
});

test("canonical palette LUTs are complete, cyclic, and revision-locked", async () => {
  const {
    DEFAULT_MANDELBROT_PALETTE_ID,
    MANDELBROT_PALETTE_IDS,
    MANDELBROT_PALETTES,
    samplePaletteRgb,
  } = await importTypeScriptModule("../app/fractal/mandelbrot-palettes.ts");

  assert.equal(DEFAULT_MANDELBROT_PALETTE_ID, "classic");
  assert.deepEqual(MANDELBROT_PALETTE_IDS, [
    "classic",
    "retro",
    "scientific",
    "monochrome",
    "spectrum",
  ]);
  assert.deepEqual(
    Object.fromEntries(MANDELBROT_PALETTE_IDS.map((id) => [id, MANDELBROT_PALETTES[id].lut.length / 3])),
    { classic: 400, retro: 24, scientific: 256, monochrome: 256, spectrum: 256 },
  );
  assert.deepEqual([...MANDELBROT_PALETTES.retro.lut.slice(0, 6)], [0, 0, 252, 64, 0, 252]);
  assert.deepEqual([...MANDELBROT_PALETTES.scientific.lut.slice(0, 3)], [115, 57, 87]);
  assert.deepEqual([...MANDELBROT_PALETTES.monochrome.lut.slice(0, 3)], [120, 120, 120]);
  assert.deepEqual([...MANDELBROT_PALETTES.spectrum.lut.slice(0, 3)], [247, 55, 26]);
  assert.equal(MANDELBROT_PALETTES.classic.version, "classic-v2-upr-serialized-phase");
  assert.equal(MANDELBROT_PALETTES.classic.sha256, "a35d55edd0058e0c8a83a270e1c42495a81a4424675b654f7dc31953fb5280b3");
  assert.equal(MANDELBROT_PALETTES.retro.sha256, "87dd131534c7cdd92aaf26e71e238f9c741889a75a90ea8268c4c09028a7d31c");
  assert.equal(MANDELBROT_PALETTES.scientific.sha256, "659c9152cdc46a62d7367c9aab8e5106819ba67767a527bff9bc4b3986740961");
  assert.equal(MANDELBROT_PALETTES.monochrome.sha256, "88d5deae76c17848cff25f55cde853c93df3f31ee213a05db956d4d1244e4c88");
  assert.equal(MANDELBROT_PALETTES.spectrum.sha256, "718a7e429a80deedd2e18e63ee8ea840f90b975c26d7c940844abf72c5ee3211");
  assert.deepEqual(
    [...MANDELBROT_PALETTES.classic.lut.slice(28 * 3, 28 * 3 + 3)],
    [0, 7, 100],
    "UPR control index 28 is canonical; rotation=29 is not baked a second time",
  );

  for (const id of MANDELBROT_PALETTE_IDS) {
    assert.deepEqual(samplePaletteRgb(id, -0.125), samplePaletteRgb(id, 0));
    assert.deepEqual(samplePaletteRgb(id, Number.NaN), samplePaletteRgb(id, 0));
  }
});

test("reference coordinates preserve every field from escape through RGB", async () => {
  const {
    calculateMandelbrotColorSample,
    repeatNonNegativeGradientIndex,
  } = await importTypeScriptModule(
    "../app/fractal/mandelbrot-coloring.ts",
  );
  const { samplePaletteRgb } = await importTypeScriptModule(
    "../app/fractal/mandelbrot-palettes.ts",
  );
  const references = [
    {
      label: "quick escape",
      c: [2, 2],
      n: 3,
      z: [-94, 42],
      fields: [0.15331178324891204, 0.06439094896454306, 0.06240275666974401, 0.06240275666974401],
      rgb: [0, 7, 97],
    },
    {
      label: "boundary",
      c: [-0.75, 0.1],
      n: 36,
      z: [-1673.2065465184091, 3498.1466711262256],
      fields: [1.761596139131006, 0.7398703784350225, 0.55381061529925, 0.55381061529925],
      rgb: [245, 244, 204],
    },
    {
      label: "high iteration",
      c: [-1.25066, 0.02012],
      n: 479,
      z: [-122.80282997063996, 612.9343663577223],
      fields: [23.92959951538832, 10.050431796463092, 2.402469503803286, 0.402469503803286],
      rgb: [183, 228, 248],
    },
    {
      label: "deep zoom",
      c: [-0.743643887037151, 0.13182590420533],
      n: 3089,
      z: [-182.62150713106195, -875.841865663923],
      fields: [154.42569020553637, 64.85878988632527, 4.1875129027485185, 0.1875129027485185],
      rgb: [19, 76, 182],
    },
  ];

  for (const reference of references) {
    const result = calculateMandelbrotColorSample(...reference.c, 5000);
    assert.equal(result.escaped, true, reference.label);
    assert.equal(result.escapeIteration, reference.n, reference.label);
    assert.ok(Math.abs(result.finalZ.re - reference.z[0]) < 1e-9, reference.label);
    assert.ok(Math.abs(result.finalZ.im - reference.z[1]) < 1e-9, reference.label);
    const actualFields = [
      result.smoothIndex,
      result.densityIndex,
      result.transferredIndex,
      result.cyclicPosition,
    ];
    actualFields.forEach((value, index) => {
      assert.ok(Math.abs(value - reference.fields[index]) < 1e-12, `${reference.label} field ${index}`);
    });
    assert.deepEqual(samplePaletteRgb("classic", result.cyclicPosition), reference.rgb);
  }

  for (const value of [-3.8, -1.2, -0.1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(repeatNonNegativeGradientIndex(value), 0);
  }
  assert.equal(repeatNonNegativeGradientIndex(0.2), 0.2);
  assert.ok(Math.abs(repeatNonNegativeGradientIndex(1.2) - 0.2) < 1e-15);
  assert.ok(Math.abs(repeatNonNegativeGradientIndex(3.7) - 0.7) < 1e-15);
});

test("fast float and precise reference color mapping agree away from precision limits", async () => {
  const { calculateMandelbrotColorSample } = await importTypeScriptModule(
    "../app/fractal/mandelbrot-coloring.ts",
  );
  const { samplePaletteRgb } = await importTypeScriptModule(
    "../app/fractal/mandelbrot-palettes.ts",
  );

  function fastFloatSample(re, im, maxIterations) {
    const f = Math.fround;
    let zr = f(0);
    let zi = f(0);
    for (let index = 0; index < maxIterations; index += 1) {
      const nextRe = f(f(f(zr * zr) - f(zi * zi)) + f(re));
      zi = f(f(f(2 * zr) * zi) + f(im));
      zr = nextRe;
      const magnitudeSquared = f(f(zr * zr) + f(zi * zi));
      if (magnitudeSquared > 10_000) {
        const magnitude = f(Math.sqrt(magnitudeSquared));
        const smooth = f(0.05 * f(
          f(index + 1) + f(
            f(Math.log(Math.log(128)) - Math.log(Math.log(magnitude))) /
            Math.log(2),
          ),
        ));
        const density = f(0.42 * smooth);
        if (!(density > 0)) return 0;
        const transferred = f(Math.log(f(1 + density)));
        if (!(transferred > 0)) return 0;
        return transferred - Math.floor(transferred);
      }
    }
    return null;
  }

  for (const coordinate of [[2, 2], [-0.75, 0.1], [-0.16, 1.0405]]) {
    const precise = calculateMandelbrotColorSample(...coordinate, 1000);
    const fast = fastFloatSample(...coordinate, 1000);
    assert.ok(Math.abs(fast - precise.cyclicPosition) < 2e-5);
    for (const paletteId of ["classic", "retro", "scientific", "monochrome", "spectrum"]) {
      const fastRgb = samplePaletteRgb(paletteId, fast);
      const preciseRgb = samplePaletteRgb(paletteId, precise.cyclicPosition);
      assert.ok(Math.max(...fastRgb.map((channel, index) => Math.abs(channel - preciseRgb[index]))) <= 2);
    }
  }
});

test("legacy preferences migrate into separate game rules and user settings", async () => {
  const previousWindow = globalThis.window;
  const storage = new Map();
  storage.set("mandelguessr.settings.v1", JSON.stringify({
    magnification: 300,
    roundCount: 3,
    questionPanAllowed: true,
  }));
  globalThis.window = {
    location: { href: "https://mandelguessr.test/" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };

  try {
    const { loadGameRules, loadUserSettings, saveUserSettings } = await importTypeScriptModule(
      "../app/game/preferences.ts",
    );
    assert.deepEqual(loadGameRules(), {
      magnification: 300,
      roundCount: 3,
      questionPanAllowed: true,
      questionInspectAllowed: false,
    });
    assert.deepEqual(loadUserSettings(), { paletteId: "classic" });
    saveUserSettings({ paletteId: "scientific" });
    assert.deepEqual(loadUserSettings(), { paletteId: "scientific" });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("result sharing uses one plain-text formatter and the home URL", async () => {
  const { buildHomeUrl, formatShareResult } = await importTypeScriptModule(
    "../app/game/share-game.ts",
  );
  assert.equal(buildHomeUrl(), "https://phi404.github.io/mandelguessr/");
  assert.equal(buildHomeUrl("https://phi404.github.io/mandelguessr?debug=1#top"), "https://phi404.github.io/mandelguessr/");
  const rules = {
    magnification: 1000,
    roundCount: 5,
    questionPanAllowed: false,
    questionInspectAllowed: true,
  };
  const text = formatShareResult({
    scores: [4000, 4200, 4300, 4400, 4447].map((points) => ({ points })),
    rules,
    homeUrl: buildHomeUrl("https://phi404.github.io/mandelguessr/?share=game&seed=10#result"),
  });

  assert.equal(text, `MandelGuessr

21,347 / 25,000
AVG 4,269

×1000 · 5 ROUNDS
PAN OFF · INSPECT ON

#MandelGuessr
https://phi404.github.io/mandelguessr/`);
  assert.doesNotMatch(text, /\b(?:seed|generator|palette|GUESS|TARGET)\b/i);

  const singleRound = formatShareResult({
    scores: [{ points: 4872 }],
    rules: {
      ...rules,
      roundCount: 1,
    },
    homeUrl: "https://mandelguessr.test/",
  });
  assert.match(singleRound, /4,872 \/ 5,000/);
  assert.match(singleRound, /×1000 · 1 ROUND/);
  assert.doesNotMatch(singleRound, /AVG/);
});

test("result map clips the GUESS-TARGET segment and fits both points", async () => {
  const { clipSegmentToViewport, fitResultCamera } = await importTypeScriptModule(
    "../app/game/result-map.ts",
  );
  assert.deepEqual(
    clipSegmentToViewport({ x: 0.5, y: 0.5 }, { x: 2, y: 0.5 }),
    { start: { x: 0.5, y: 0.5 }, end: { x: 1, y: 0.5 } },
  );
  assert.deepEqual(
    clipSegmentToViewport({ x: -1, y: 0.5 }, { x: 2, y: 0.5 }),
    { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  );
  assert.equal(
    clipSegmentToViewport({ x: -1, y: -1 }, { x: -0.5, y: -0.5 }),
    null,
  );

  const camera = fitResultCamera(
    { re: -2, im: -1 },
    { re: 1, im: 1 },
    0.5,
    0.1,
  );
  assert.deepEqual(
    { centerRe: camera.centerRe, centerIm: camera.centerIm },
    { centerRe: -0.5, centerIm: 0 },
  );
  assert.ok(camera.viewportWidth > 5.5);
});

test("PLAY AGAIN always chooses a seed different from the previous game", async () => {
  const { createNextGameSeed } = await importTypeScriptModule(
    "../app/game/seed.ts",
  );
  assert.equal(createNextGameSeed(7, 9), 9);
  assert.equal(createNextGameSeed(7, 7), 8);
  assert.equal(createNextGameSeed(0xffffffff, 0xffffffff), 0);
});
