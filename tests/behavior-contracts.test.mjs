import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTypeScriptModule } from "./helpers/import-typescript-module.mjs";

const EPSILON = 1e-12;

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function fakeWebGlContext() {
  const uniforms = new Map();
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE0: 5,
    TEXTURE_2D: 6,
    UNPACK_ALIGNMENT: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    REPEAT: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    LINEAR: 14,
    RGB8: 15,
    RGB: 16,
    UNSIGNED_BYTE: 17,
    TRIANGLES: 18,
    RGBA: 19,
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader() {},
    createProgram: () => ({}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram() {},
    getUniformLocation: (_program, name) => ({ name }),
    createTexture: () => ({}),
    deleteTexture() {},
    activeTexture() {},
    bindTexture() {},
    bindFramebuffer() {},
    pixelStorei() {},
    texParameteri() {},
    texImage2D() {},
    isContextLost: () => false,
    viewport() {},
    useProgram() {},
    uniform2f(location, first, second) {
      uniforms.set(location.name, [first, second]);
    },
    uniform1ui() {},
    uniform1i(location, value) {
      uniforms.set(location.name, value);
    },
    uniform1f(location, value) {
      uniforms.set(location.name, value);
    },
    drawArrays() {},
    readPixels(_x, _y, width, height, _format, _type, pixels) {
      const numericUniforms = [...uniforms.values()].flat();
      const seed = Math.abs(Math.round(
        numericUniforms.reduce((sum, value) => sum + value, 0) * 1000,
      )) % 256;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = (seed + x) % 256;
          pixels[offset + 1] = y;
          pixels[offset + 2] = (x + y) % 256;
          pixels[offset + 3] = 255;
        }
      }
    },
  };
}

async function withRenderer(options, run, environment = {}) {
  const previous = {
    window: globalThis.window,
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const rect = { left: 100, top: 50, width: 800, height: 500 };
  const gl = fakeWebGlContext();
  const listeners = new Map();
  const capturedPointers = new Set();
  const canvas = {
    width: 800,
    height: 500,
    dataset: {},
    clientWidth: 800,
    clientHeight: 500,
    getContext: () => gl,
    getBoundingClientRect: () => rect,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    setPointerCapture: (pointerId) => capturedPointers.add(pointerId),
    releasePointerCapture: (pointerId) => capturedPointers.delete(pointerId),
    hasPointerCapture: (pointerId) => capturedPointers.has(pointerId),
    focus() {},
  };

  globalThis.window = {
    setTimeout: () => 1,
    clearTimeout() {},
    devicePixelRatio: 1,
    ...environment,
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};

  try {
    const { WebGLMandelbrotRenderer } = await importTypeScriptModule(
      "../app/fractal/WebGLMandelbrotRenderer.ts",
    );
    const renderer = new WebGLMandelbrotRenderer(canvas, options);
    try {
      await run({ renderer, canvas, rect, listeners });
    } finally {
      renderer.dispose();
    }
  } finally {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.ResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previous.ResizeObserver;
    if (previous.requestAnimationFrame === undefined) {
      delete globalThis.requestAnimationFrame;
    } else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) {
      delete globalThis.cancelAnimationFrame;
    } else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
  }
}

test("shared camera math preserves projection, zoom, anchors, and fixed centers", async () => {
  const {
    cameraForAnchoredViewportWidth,
    clampViewportWidth,
    complexToScreen,
    fixedCenterCorrection,
    screenToComplex,
    viewportWidthToZoom,
    zoomToViewportWidth,
  } = await importTypeScriptModule("../app/fractal/camera.ts");
  const camera = { centerRe: -0.75, centerIm: 0.125, viewportWidth: 1.2 };
  const viewport = { width: 800, height: 500 };
  const points = [
    { x: 400, y: 250 },
    { x: 0, y: 0 },
    { x: 800, y: 500 },
    { x: 138.4, y: 410.5 },
  ];

  for (const point of points) {
    const complex = screenToComplex(point, camera, viewport);
    const projected = complexToScreen(complex, camera, viewport);
    assertClose(projected.x, point.x / viewport.width, "shared projection x");
    assertClose(projected.y, point.y / viewport.height, "shared projection y");
  }

  assertClose(viewportWidthToZoom(1.2), 3, "viewport width to zoom");
  assertClose(zoomToViewportWidth(3), 1.2, "zoom to viewport width");
  assertClose(
    clampViewportWidth(99, { min: 0.8, max: 40_000 }),
    4.5,
    "minimum zoom clamp",
  );
  assertClose(
    clampViewportWidth(0, { min: 0.8, max: 40_000 }),
    0.00009,
    "maximum zoom clamp",
  );

  const anchorPoint = { x: 623, y: 117 };
  const anchor = screenToComplex(anchorPoint, camera, viewport);
  const zoomed = cameraForAnchoredViewportWidth(
    camera,
    anchorPoint,
    anchorPoint,
    viewport,
    camera.viewportWidth / 2,
  );
  const anchoredAfterZoom = screenToComplex(anchorPoint, zoomed, viewport);
  assertClose(anchoredAfterZoom.re, anchor.re, "shared zoom anchor Re");
  assertClose(anchoredAfterZoom.im, anchor.im, "shared zoom anchor Im");

  const correction = fixedCenterCorrection(
    { centerRe: -0.7, centerIm: 0.2, viewportWidth: 0.3, zoom: 12 },
    { re: -0.743, im: 0.131 },
  );
  assert.deepEqual(correction, {
    centerRe: -0.743,
    centerIm: 0.131,
    viewportWidth: 0.3,
    zoom: 12,
  });
  assert.equal(
    fixedCenterCorrection(
      { centerRe: -0.743, centerIm: 0.131, viewportWidth: 0.3, zoom: 12 },
      { re: -0.743, im: 0.131 },
    ),
    null,
  );
});

test("camera maps center, corners, and arbitrary screen points round-trip", async () => {
  const camera = { centerRe: -0.75, centerIm: 0.125, viewportWidth: 1.2 };
  await withRenderer(
    {
      initialCamera: camera,
      interaction: { pan: true, zoom: true, select: true },
    },
    ({ renderer, rect }) => {
      const points = [
        { x: 0.5, y: 0.5 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 0.173, y: 0.821 },
      ];
      const viewportHeight = camera.viewportWidth * (rect.height / rect.width);

      for (const point of points) {
        const complex = renderer.coordinateAt(
          rect.left + point.x * rect.width,
          rect.top + point.y * rect.height,
        );
        const projected = {
          x: 0.5 + (complex.re - camera.centerRe) / camera.viewportWidth,
          y: 0.5 - (complex.im - camera.centerIm) / viewportHeight,
        };
        assertClose(projected.x, point.x, "round-trip x");
        assertClose(projected.y, point.y, "round-trip y");
      }

      const top = renderer.coordinateAt(rect.left + rect.width / 2, rect.top);
      const bottom = renderer.coordinateAt(
        rect.left + rect.width / 2,
        rect.top + rect.height,
      );
      assert.ok(top.im > camera.centerIm, "screen top must increase Im");
      assert.ok(bottom.im < camera.centerIm, "screen bottom must decrease Im");
      assertClose(top.im - bottom.im, viewportHeight, "canvas aspect height");
    },
  );
});

test("zoom definition, limits, wheel anchor, and pinch midpoint stay fixed", async () => {
  const initialCamera = { centerRe: -0.55, centerIm: 0, viewportWidth: 3.6 };
  await withRenderer(
    {
      initialCamera,
      interaction: { pan: true, zoom: true, select: false },
      zoomLimits: { min: 0.8, max: 40_000 },
    },
    ({ renderer, rect }) => {
      assertClose(3.6 / renderer.camera.viewportWidth, 1, "initial zoom");

      renderer.focus(-0.55, 0, 1_000_000);
      assertClose(3.6 / renderer.camera.viewportWidth, 40_000, "maximum zoom");
      renderer.focus(-0.55, 0, 0.01);
      assertClose(3.6 / renderer.camera.viewportWidth, 0.8, "minimum zoom");
      renderer.reset();

      const wheelPoint = {
        clientX: rect.left + 623,
        clientY: rect.top + 117,
      };
      const wheelAnchorBefore = renderer.coordinateAt(
        wheelPoint.clientX,
        wheelPoint.clientY,
      );
      renderer.handleWheel({
        ...wheelPoint,
        deltaY: -180,
        preventDefault() {},
      });
      const wheelAnchorAfter = renderer.coordinateAt(
        wheelPoint.clientX,
        wheelPoint.clientY,
      );
      assertClose(wheelAnchorAfter.re, wheelAnchorBefore.re, "wheel anchor Re");
      assertClose(wheelAnchorAfter.im, wheelAnchorBefore.im, "wheel anchor Im");

      const first = { pointerId: 1, button: 0, clientX: 300, clientY: 260 };
      const second = { pointerId: 2, button: 0, clientX: 650, clientY: 300 };
      renderer.handlePointerDown(first);
      renderer.handlePointerDown(second);
      const previousMidpoint = {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };
      const pinchAnchorBefore = renderer.coordinateAt(
        previousMidpoint.x,
        previousMidpoint.y,
      );
      const movedSecond = { ...second, clientX: 730, clientY: 350 };
      renderer.handlePointerMove(movedSecond);
      const nextMidpoint = {
        x: (first.clientX + movedSecond.clientX) / 2,
        y: (first.clientY + movedSecond.clientY) / 2,
      };
      const pinchAnchorAfter = renderer.coordinateAt(nextMidpoint.x, nextMidpoint.y);
      assertClose(pinchAnchorAfter.re, pinchAnchorBefore.re, "pinch anchor Re");
      assertClose(pinchAnchorAfter.im, pinchAnchorBefore.im, "pinch anchor Im");
    },
  );
});

test("fixed seeds retain exact question order, IDs, cells, and cameras", async () => {
  const { buildRoundQuestions } = await importTypeScriptModule(
    "../app/game/question-generator.ts",
  );
  const cases = [
    {
      settings: { magnification: 30, roundCount: 5 },
      seed: 123456,
      expected: [
        ["123456-30-15-7", -0.538, -0.58287935402376, 0.12000000000000001, 15, 7, 30],
        ["123456-30-18-3", -0.15399999999999991, -0.8345070663000775, 0.12000000000000001, 18, 3, 30],
        ["123456-30-16-6", -0.3460000000000001, -0.6252149540327512, 0.12000000000000001, 16, 6, 30],
        ["123456-30-22-17", 0.3740000000000001, 0.17437315462098246, 0.12000000000000001, 22, 17, 30],
        ["123456-30-14-19", -0.6579999999999999, 0.3380911452486429, 0.12000000000000001, 14, 19, 30],
      ],
    },
    {
      settings: { magnification: 75.5, roundCount: 3 },
      seed: 0xdeadbeef,
      expected: [
        ["3735928559-76-34-33", -0.7347368421052631, -0.14210521333937684, 0.04768211920529802, 34, 33, 76],
        ["3735928559-76-28-46", -1.0189473684210526, 0.24933072648478868, 0.04768211920529802, 28, 46, 76],
        ["3735928559-76-20-38", -1.3694736842105264, 0.00586459796053861, 0.04768211920529802, 20, 38, 76],
      ],
    },
    {
      settings: { magnification: 10_000, roundCount: 2 },
      seed: 20260820,
      expected: [
        ["20260820-10000-4461-5514", -0.743716, 0.11578465254450154, 0.00036, 4461, 5514, 10000],
        ["20260820-10000-4961-7053", -0.56386, 0.4619475034439645, 0.00036, 4961, 7053, 10000],
      ],
    },
  ];

  for (const { settings, seed, expected } of cases) {
    const actual = buildRoundQuestions(settings, seed).map((question) => [
      question.id,
      question.camera.centerRe,
      question.camera.centerIm,
      question.camera.viewportWidth,
      question.boundaryCell.column,
      question.boundaryCell.row,
      question.boundaryCell.gridSize,
    ]);
    assert.deepEqual(actual, expected);
  }
});

test("question worker reports unavailable graphics instead of emitting unchecked questions", async () => {
  const previousOnMessage = globalThis.onmessage;
  const previousPostMessage = globalThis.postMessage;
  const responses = [];
  globalThis.postMessage = (response) => responses.push(response);

  try {
    await importTypeScriptModule("../app/game/question-generator.worker.ts");
    const settings = { magnification: 30, roundCount: 5 };
    const gameSeed = 123456;
    await globalThis.onmessage({ data: { settings, gameSeed } });
    assert.equal(responses.length, 1);
    assert.equal(responses[0].ok, false);
    assert.equal(responses[0].code, "graphics-unavailable");
    assert.equal("questions" in responses[0], false);
  } finally {
    if (previousOnMessage === undefined) delete globalThis.onmessage;
    else globalThis.onmessage = previousOnMessage;
    if (previousPostMessage === undefined) delete globalThis.postMessage;
    else globalThis.postMessage = previousPostMessage;
  }
});

test("Game Rules accept current bounds and decimal magnification only", async () => {
  const generator = await importTypeScriptModule("../app/game/question-generator.ts");
  const rules = await importTypeScriptModule("../app/game/game-rules.ts");
  assert.deepEqual(rules.DEFAULT_GAME_RULES, {
    magnification: 30,
    roundCount: 5,
    questionPanAllowed: false,
    questionInspectAllowed: false,
  });
  assert.equal(generator.buildRoundQuestions({ magnification: 10, roundCount: 1 }, 1).length, 1);
  assert.equal(
    generator.buildRoundQuestions({ magnification: 10_000, roundCount: 1 }, 1).length,
    1,
  );
  assert.equal(
    generator.buildRoundQuestions({ magnification: 75.5, roundCount: 1 }, 1)[0]
      .boundaryCell.gridSize,
    76,
  );
  for (const settings of [
    { magnification: 9, roundCount: 1 },
    { magnification: 10_001, roundCount: 1 },
    { magnification: Number.NaN, roundCount: 1 },
    { magnification: 30, roundCount: 0 },
    { magnification: 30, roundCount: 21 },
    { magnification: 30, roundCount: 1.5 },
  ]) {
    assert.throws(() => generator.buildRoundQuestions(settings, 1));
    assert.equal(
      rules.parseGameRules({
        ...settings,
        questionPanAllowed: false,
        questionInspectAllowed: false,
      }),
      null,
    );
  }

  for (const questionPanAllowed of [false, true]) {
    for (const questionInspectAllowed of [false, true]) {
      const value = {
        magnification: 75.5,
        roundCount: 3,
        questionPanAllowed,
        questionInspectAllowed,
      };
      assert.deepEqual(rules.parseGameRules(value), value);
      assert.deepEqual(rules.questionViewportInteraction(value), {
        pan: questionPanAllowed,
        zoom: questionInspectAllowed,
        select: false,
      });
    }
  }

  assert.deepEqual(
    rules.parseLegacyGameRules({
      magnification: 100,
      roundCount: 10,
      questionPanAllowed: true,
    }),
    {
      magnification: 100,
      roundCount: 10,
      questionPanAllowed: true,
      questionInspectAllowed: false,
    },
  );
  assert.equal(rules.parseGameRules(null), null);
  assert.equal(rules.parseGameRules({}), null);
  assert.equal(rules.parseLegacyGameRules({ magnification: 100 }), null);
  assert.deepEqual(rules.createQuestionZoomLimits(30), { min: 30, max: 1e20 });
});

test("game session fixes generation, rounds, retry, PLAY AGAIN, and overlay transitions", async () => {
  const {
    createInitialGameSession,
    gameSessionReducer,
  } = await importTypeScriptModule("../app/game/game-session.ts");
  const rules = {
    magnification: 30,
    roundCount: 2,
    questionPanAllowed: true,
    questionInspectAllowed: false,
  };
  const questions = [0, 1].map((index) => ({
    id: `question-${index}`,
    camera: {
      centerRe: -0.75 + index * 0.1,
      centerIm: 0.1,
      viewportWidth: 0.12,
    },
    magnification: 30,
    boundaryCell: { column: index, row: index + 1, gridSize: 30 },
  }));
  const guess = { re: -0.7, im: 0.15 };
  const score = {
    points: 4000,
    maximum: 5000,
    coordinateDistance: 0.05,
    normalizedDistance: 0.25,
  };
  const request = { rules, seed: 123, persistRules: true };
  let state = createInitialGameSession("session-initial");
  const dispatch = (action) => {
    state = gameSessionReducer(state, action);
  };

  dispatch({ type: "SHOW_SETUP", phase: "new-game" });
  assert.equal(state.phase, "new-game");
  dispatch({ type: "START_GENERATION", request });
  assert.equal(state.phase, "creating");
  assert.equal(state.pendingCreation, request);
  dispatch({ type: "GENERATION_FAILED", message: "generation failed" });
  assert.equal(state.phase, "creation-error");
  assert.equal(state.generationError, "generation failed");
  dispatch({ type: "START_GENERATION", request: state.pendingCreation });
  assert.equal(state.phase, "creating");
  assert.equal(state.generationError, null);
  dispatch({
    type: "GENERATION_SUCCEEDED",
    request,
    questions,
    sessionId: "session-first",
  });
  assert.equal(state.phase, "play");
  assert.equal(state.sessionId, "session-first");
  assert.equal(state.gameSeed, 123);

  dispatch({ type: "SET_GUESS", guess });
  assert.equal(state.phase, "play");
  assert.deepEqual(state.guess, guess);
  dispatch({
    type: "SUBMIT_GUESS",
    record: { question: questions[0], guess, score },
  });
  assert.equal(state.phase, "round-result");
  assert.equal(state.records.length, 1);
  dispatch({ type: "CONTINUE" });
  assert.equal(state.phase, "play", "a non-final round must return to PLAY");
  assert.equal(state.roundIndex, 1);
  assert.equal(state.guess, null);

  dispatch({ type: "SET_GUESS", guess });
  dispatch({
    type: "SUBMIT_GUESS",
    record: { question: questions[1], guess, score },
  });
  dispatch({ type: "CONTINUE" });
  assert.equal(state.phase, "final-result", "only the final round may finish");

  const playAgainRequest = { rules: state.gameRules, seed: 124, persistRules: false };
  dispatch({ type: "START_GENERATION", request: playAgainRequest });
  dispatch({
    type: "GENERATION_SUCCEEDED",
    request: playAgainRequest,
    questions,
    sessionId: "session-second",
  });
  assert.equal(state.phase, "play");
  assert.equal(state.gameRules, rules);
  assert.equal(state.gameSeed, 124);
  assert.equal(state.sessionId, "session-second");
  assert.deepEqual(state.records, []);
  assert.equal(state.guess, null);
  assert.equal(state.roundIndex, 0);

  dispatch({ type: "OPEN_OVERLAY", overlay: "menu" });
  assert.equal(state.overlay, "menu");
  assert.equal(state.roundPaused, true);
  dispatch({ type: "OPEN_OVERLAY", overlay: "information" });
  assert.equal(state.overlay, "information");
  assert.equal(state.roundPaused, true);
  dispatch({ type: "CLOSE_OVERLAY" });
  assert.equal(state.overlay, null);
  assert.equal(state.roundPaused, false);
  dispatch({ type: "OPEN_OVERLAY", overlay: "settings" });
  assert.equal(state.overlay, "settings");
  assert.equal(state.roundPaused, true);
  dispatch({ type: "CLOSE_OVERLAY" });
  assert.equal(state.roundPaused, false);
});

function createStorage(initial = new Map()) {
  const values = new Map(initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

async function withWindow(windowValue, run) {
  const previousWindow = globalThis.window;
  globalThis.window = windowValue;
  try {
    await run();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("preferences preserve current, legacy, corrupt, unknown, and throwing storage behavior", async () => {
  const preferences = await importTypeScriptModule("../app/game/preferences.ts");
  const currentRules = {
    magnification: 300,
    roundCount: 3,
    questionPanAllowed: true,
    questionInspectAllowed: true,
  };
  const currentStorage = createStorage(new Map([
    ["mandelguessr.game-rules.v1", JSON.stringify(currentRules)],
    ["mandelguessr.user-settings.v1", JSON.stringify({ paletteId: "scientific" })],
  ]));
  await withWindow({ localStorage: currentStorage }, async () => {
    assert.deepEqual(preferences.loadGameRules(), currentRules);
    assert.deepEqual(preferences.loadUserSettings(), { paletteId: "scientific" });
    preferences.saveUserSettings({ paletteId: "spectrum" });
    assert.deepEqual(preferences.loadUserSettings(), { paletteId: "spectrum" });
  });

  const legacyStorage = createStorage(new Map([
    ["mandelguessr.settings.v1", JSON.stringify({
      magnification: 100,
      roundCount: 10,
      questionPanAllowed: true,
      paletteId: "retro",
    })],
  ]));
  await withWindow({ localStorage: legacyStorage }, async () => {
    assert.deepEqual(preferences.loadGameRules(), {
      magnification: 100,
      roundCount: 10,
      questionPanAllowed: true,
      questionInspectAllowed: false,
    });
    assert.deepEqual(preferences.loadUserSettings(), { paletteId: "retro" });
  });

  for (const storage of [
    createStorage(new Map([
      ["mandelguessr.game-rules.v1", "{"],
      ["mandelguessr.user-settings.v1", "{"],
    ])),
    createStorage(new Map([
      ["mandelguessr.game-rules.v1", JSON.stringify({ magnification: 1 })],
      ["mandelguessr.user-settings.v1", JSON.stringify({ paletteId: "unknown" })],
    ])),
  ]) {
    await withWindow({ localStorage: storage }, async () => {
      assert.deepEqual(preferences.loadGameRules(), gameDefaults());
      assert.deepEqual(preferences.loadUserSettings(), { paletteId: "classic" });
    });
  }

  const throwingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  await withWindow({ localStorage: throwingStorage }, async () => {
    assert.deepEqual(preferences.loadGameRules(), gameDefaults());
    assert.deepEqual(preferences.loadUserSettings(), { paletteId: "classic" });
    assert.doesNotThrow(() => preferences.saveGameRules(gameDefaults()));
    assert.doesNotThrow(() => preferences.saveUserSettings({ paletteId: "classic" }));
  });
});

function gameDefaults() {
  return {
    magnification: 30,
    roundCount: 5,
    questionPanAllowed: false,
    questionInspectAllowed: false,
  };
}

test("result map handles equal points, axes, extreme aspect, clipping, and auto-fit", async () => {
  const { clipSegmentToViewport, fitResultCamera } = await importTypeScriptModule(
    "../app/game/result-map.ts",
  );
  assert.deepEqual(
    clipSegmentToViewport({ x: 0.4, y: 0.6 }, { x: 0.4, y: 0.6 }),
    { start: { x: 0.4, y: 0.6 }, end: { x: 0.4, y: 0.6 } },
  );
  assert.deepEqual(
    clipSegmentToViewport({ x: 0.5, y: -2 }, { x: 0.5, y: 3 }),
    { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  );
  assert.deepEqual(
    clipSegmentToViewport({ x: -2, y: 0.25 }, { x: 3, y: 0.25 }),
    { start: { x: 0, y: 0.25 }, end: { x: 1, y: 0.25 } },
  );
  assert.equal(
    clipSegmentToViewport({ x: -2, y: 2 }, { x: -1, y: 3 }),
    null,
  );

  const equalCamera = fitResultCamera(
    { re: -0.75, im: 0.1 },
    { re: -0.75, im: 0.1 },
    0.625,
    0.25,
  );
  assert.deepEqual(equalCamera, {
    centerRe: -0.75,
    centerIm: 0.1,
    viewportWidth: 0.25,
  });
  const narrowCamera = fitResultCamera(
    { re: 0, im: -2 },
    { re: 0, im: 2 },
    0,
    0.1,
  );
  assert.ok(narrowCamera.viewportWidth > 500, "extreme aspect must still contain both points");
  const horizontalCamera = fitResultCamera(
    { re: -3, im: 0 },
    { re: 3, im: 0 },
    0.625,
    0.1,
  );
  assert.equal(horizontalCamera.centerRe, 0);
  assert.equal(horizontalCamera.centerIm, 0);
  assert.ok(horizontalCamera.viewportWidth > 8);
});

test("Mandelbrot image API is deterministic, versioned, sized, oriented, and validated", async () => {
  const previous = {
    ImageData: globalThis.ImageData,
    OffscreenCanvas: globalThis.OffscreenCanvas,
  };
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.gl = fakeWebGlContext();
      this.context2d = { putImageData() {} };
    }

    getContext(type) {
      if (type === "webgl2") return this.gl;
      if (type === "2d") return this.context2d;
      return null;
    }

    async convertToBlob({ type }) {
      return new Blob([pngSignature], { type });
    }
  };

  try {
    const {
      MandelbrotImageRenderer,
      createMandelbrotSampleMetadata,
      generateMandelbrotSample,
      renderMandelbrotImage,
      validateMandelbrotRenderParams,
    } = await importTypeScriptModule("../app/fractal/mandelbrot-render.ts");
    const { imageDataToPngBlob } = await importTypeScriptModule(
      "../app/fractal/mandelbrot-export.ts",
    );
    const params = {
      centerRe: -0.743643887037151,
      centerIm: 0.13182590420533,
      zoom: 1_000,
      width: 7,
      height: 5,
      paletteId: "classic",
      maxIterations: 1_460,
    };

    const first = renderMandelbrotImage(params);
    const second = renderMandelbrotImage({ ...params });
    assert.equal(first.width, params.width);
    assert.equal(first.height, params.height);
    assert.equal(first.data.length, params.width * params.height * 4);
    assert.deepEqual(first.data, second.data, "identical parameters must reproduce bytes");
    assert.equal(first.data[1], params.height - 1, "ImageData top row must map from WebGL's last row");
    assert.equal(first.data[3], 255);

    const renderer = new MandelbrotImageRenderer();
    const reusableFirst = renderer.render(params);
    const reusableSecond = renderer.render({ ...params, centerRe: -0.7 });
    assert.deepEqual(reusableFirst.data, first.data);
    assert.notDeepEqual(reusableSecond.data, reusableFirst.data);
    renderer.dispose();
    assert.throws(() => renderer.render(params), /破棄済み/);

    const metadata = createMandelbrotSampleMetadata(params);
    assert.deepEqual(metadata, {
      ...params,
      rendererVersion: "mandelbrot-renderer-v3",
      paletteVersion: "classic-v2-upr-serialized-phase",
    });
    const sample = generateMandelbrotSample(params);
    assert.deepEqual(sample.image.data, first.data);
    assert.deepEqual(sample.metadata, metadata);

    const png = await imageDataToPngBlob(first);
    assert.equal(png.type, "image/png");
    assert.deepEqual(
      new Uint8Array(await png.arrayBuffer()).slice(0, 8),
      pngSignature,
    );

    for (const invalid of [
      { ...params, width: 0 },
      { ...params, height: -1 },
      { ...params, width: 1.5 },
      { ...params, zoom: 0 },
      { ...params, zoom: Number.NaN },
      { ...params, centerRe: Number.POSITIVE_INFINITY },
      { ...params, paletteId: "unknown" },
      { ...params, maxIterations: 0 },
      { ...params, maxIterations: 32_769 },
      { ...params, maxIterations: 4.5 },
    ]) {
      assert.throws(() => validateMandelbrotRenderParams(invalid));
    }
  } finally {
    if (previous.ImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = previous.ImageData;
    if (previous.OffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous.OffscreenCanvas;
  }
});

test("dataset export keeps PNG, JSONL, manifest, cancellation, and one renderer aligned", async () => {
  const previous = {
    ImageData: globalThis.ImageData,
    OffscreenCanvas: globalThis.OffscreenCanvas,
  };
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let webGlContextCount = 0;

  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.gl = fakeWebGlContext();
      this.context2d = { putImageData() {} };
    }

    getContext(type) {
      if (type === "webgl2") {
        webGlContextCount += 1;
        return this.gl;
      }
      if (type === "2d") return this.context2d;
      return null;
    }

    async convertToBlob({ type }) {
      return new Blob([pngSignature], { type });
    }
  };

  try {
    const {
      createMandelbrotDatasetManifest,
      generateMandelbrotDatasetSamples,
      isMandelbrotDatasetCancellation,
    } = await importTypeScriptModule("../app/fractal/mandelbrot-dataset.ts");
    const { saveMandelbrotDatasetToDirectory } = await importTypeScriptModule(
      "../app/fractal/mandelbrot-dataset-filesystem.ts",
    );
    const config = {
      width: 4,
      height: 3,
      paletteId: "classic",
      maxIterations: 50,
    };

    for (const count of [10, 100]) {
      const root = fakeFileSystemDirectory("dataset-root");
      const generationSource = {
        version: "distance-guided-visible-v1",
        proposalIndex: 7,
        anchor: { re: -0.8, im: 0.2 },
        quality: { energy: 0.2, threshold: 0.1, metricVersion: "rgb-population-variance-v1" },
      };
      const points = Array.from({ length: count }, (_, index) => ({
        id: String(index).padStart(6, "0"),
        centerRe: -0.75 + index * 0.0001,
        centerIm: 0.1,
        zoom: 30,
        ...(index === 0 ? { source: generationSource } : {}),
      }));
      const manifest = createMandelbrotDatasetManifest(
        points,
        config,
        { samplingMethod: "test", seed: 123 },
        new Date("2026-08-31T00:00:00.000Z"),
      );
      const progress = [];
      await saveMandelbrotDatasetToDirectory(
        root,
        manifest,
        generateMandelbrotDatasetSamples(points, config),
        { onProgress: (value) => progress.push(value) },
      );

      const storedManifest = JSON.parse(await root.fileText("dataset.json"));
      const metadata = (await root.fileText("metadata.jsonl"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const images = root.directory("images");
      assert.equal(storedManifest.count, count);
      assert.equal(metadata.length, count);
      assert.equal(images.entries.size, count);
      assert.equal(progress.at(-1).completed, count);
      assert.deepEqual(metadata[0], {
        id: "000000",
        centerRe: -0.75,
        centerIm: 0.1,
        zoom: 30,
        ...config,
        rendererVersion: "mandelbrot-renderer-v3",
        paletteVersion: "classic-v2-upr-serialized-phase",
        source: generationSource,
      });
      assert.equal(metadata[1].source, undefined, "legacy points retain their metadata shape");
      for (const sample of metadata) {
        assert.ok(images.entries.has(`${sample.id}.png`));
      }
    }
    assert.equal(webGlContextCount, 2, "each dataset must create one reusable WebGL context");

    const cancelledRoot = fakeFileSystemDirectory("cancelled-root");
    const cancelledPoints = Array.from({ length: 10 }, (_, index) => ({
      id: String(index).padStart(6, "0"),
      centerRe: -0.7,
      centerIm: index * 0.001,
      zoom: 100,
    }));
    const cancelledManifest = createMandelbrotDatasetManifest(
      cancelledPoints,
      config,
      { samplingMethod: "test" },
    );
    const controller = new AbortController();
    await assert.rejects(
      saveMandelbrotDatasetToDirectory(
        cancelledRoot,
        cancelledManifest,
        generateMandelbrotDatasetSamples(cancelledPoints, config, {
          signal: controller.signal,
        }),
        {
          signal: controller.signal,
          onProgress: ({ completed }) => {
            if (completed === 3) controller.abort();
          },
        },
      ),
      (cause) => isMandelbrotDatasetCancellation(cause),
    );
    assert.equal(cancelledRoot.entries.size, 0, "partial dataset must be removed");
    assert.equal(webGlContextCount, 3);
  } finally {
    if (previous.ImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = previous.ImageData;
    if (previous.OffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous.OffscreenCanvas;
  }
});

test("interactive, API, and Generator Lab thumbnail rendering share one WebGL pipeline", async () => {
  const [interactiveSource, apiSource, thumbnailSource] = await Promise.all([
    readFile(new URL("../app/fractal/WebGLMandelbrotRenderer.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/fractal/mandelbrot-render.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/generator-lab/thumbnail.worker.ts", import.meta.url), "utf8"),
  ]);

  assert.match(interactiveSource, /MandelbrotWebGLPipeline/);
  assert.match(apiSource, /MandelbrotWebGLPipeline/);
  assert.match(thumbnailSource, /MandelbrotImageRenderer/);
  assert.doesNotMatch(thumbnailSource, /escapeColor|const PALETTE|magnitudeSquared > 256/);
});

function fakeFileSystemDirectory(name) {
  const entries = new Map();
  return {
    kind: "directory",
    name,
    entries,
    async getDirectoryHandle(entryName, options = {}) {
      const existing = entries.get(entryName);
      if (existing?.kind === "directory") return existing;
      if (existing) throw new DOMException("Type mismatch", "TypeMismatchError");
      if (!options.create) throw new DOMException("Not found", "NotFoundError");
      const directory = fakeFileSystemDirectory(entryName);
      entries.set(entryName, directory);
      return directory;
    },
    async getFileHandle(entryName, options = {}) {
      const existing = entries.get(entryName);
      if (existing?.kind === "file") return existing;
      if (existing) throw new DOMException("Type mismatch", "TypeMismatchError");
      if (!options.create) throw new DOMException("Not found", "NotFoundError");
      const file = fakeFileSystemFile(entryName, entries);
      entries.set(entryName, file);
      return file;
    },
    async removeEntry(entryName) {
      if (!entries.delete(entryName)) {
        throw new DOMException("Not found", "NotFoundError");
      }
    },
    directory(entryName) {
      const directory = entries.get(entryName);
      assert.equal(directory?.kind, "directory");
      return directory;
    },
    async fileText(entryName) {
      const file = entries.get(entryName);
      assert.equal(file?.kind, "file");
      return typeof file.contents === "string"
        ? file.contents
        : await file.contents.text();
    },
  };
}

function fakeFileSystemFile(name, parentEntries) {
  const file = {
    kind: "file",
    name,
    contents: new Blob(),
    async createWritable() {
      return {
        async write(value) {
          file.contents = value;
        },
        async close() {},
        async abort() {
          parentEntries.delete(name);
        },
      };
    },
  };
  return file;
}


test('ordinary zoom uses direct double-single rendering without reference workers', async () => {
  await withRenderer({ initialCamera:{centerRe:-0.75,centerIm:0.125,viewportWidth:3.6},zoomLimits:{min:0.7,max:1e20} },({renderer,canvas})=>{
    for(const zoom of [100,1000,10000]) {
      renderer.focus(-0.75,0.125,zoom);
      renderer.render('full');
      assert.equal(canvas.dataset.precision,'double-single');
      assert.equal(canvas.dataset.renderStatus,'ready');
      assert.equal(renderer.progressive,null);
      assert.equal(renderer.references.worker,null);
    }
  });
});

test('wheel units preserve the cursor anchor and limit each event to a small zoom step', async () => {
  await withRenderer({interaction:{pan:true,zoom:true,select:false}},({renderer,rect})=>{
    const point={clientX:rect.left+623,clientY:rect.top+117};
    const wheel=(deltaY,mode)=>{
      let readMode=false;
      renderer.handleWheel({...point,preventDefault(){},get deltaMode(){readMode=true;return mode;},get deltaY(){assert.ok(readMode);return deltaY;}});
    };
    const before=renderer.coordinateAt(point.clientX,point.clientY);
    wheel(-120,0);
    assertClose(3.6/renderer.camera.viewportWidth,1.1,'one pixel-mode notch');
    const after=renderer.coordinateAt(point.clientX,point.clientY);
    assertClose(after.re,before.re,'wheel anchor Re');
    assertClose(after.im,before.im,'wheel anchor Im');
    wheel(120,0);
    assertClose(3.6/renderer.camera.viewportWidth,1,'reverse notch');
    wheel(-48,0);
    const pixelWidth=renderer.camera.viewportWidth;
    renderer.reset();
    wheel(-3,1);
    assertClose(renderer.camera.viewportWidth,pixelWidth,'line and pixel units');
    renderer.reset();
    wheel(-1,2);
    assertClose(3.6/renderer.camera.viewportWidth,1.1,'page-mode upper bound');
    renderer.reset();
    wheel(-1,0);
    assert.ok(3.6/renderer.camera.viewportWidth>1 && 3.6/renderer.camera.viewportWidth<1.001);
  });
});


test("direct double-single rendering keeps the full desktop resolution at rest", async () => {
  await withRenderer({}, ({ renderer, canvas }) => {
    canvas.clientWidth = 1280;
    canvas.clientHeight = 720;
    for (const zoom of [1, 100, 1000, 10000]) {
      renderer.focus(-0.75, 0.125, zoom);
      renderer.render("full");
      assert.equal(canvas.width, 2560);
      assert.equal(canvas.height, 1440);
    }
    renderer.render("interactive");
    assert.ok(canvas.width * canvas.height < 122_000);
    renderer.focus(-0.75, 0.125, 1e12);
    renderer.resizeDrawingBuffer("full");
    assert.ok(canvas.width * canvas.height < 702_000);
    assert.equal(3.6 / renderer.camera.viewportWidth, 1e12);
  }, { devicePixelRatio: 2 });
});

test("touch devices clamp initial views and zoom gestures before perturbation", async () => {
  await withRenderer({
    initialCamera: { centerRe: -0.75, centerIm: 0.125, viewportWidth: 3.6 / 1e20 },
    zoomLimits: { min: 0.7, max: 1e20 },
  }, ({ renderer, canvas, rect }) => {
    assert.equal(3.6 / renderer.camera.viewportWidth, 10000);
    renderer.focus(-0.75, 0.125, 1e20);
    renderer.handleWheel({
      clientX: rect.left + 200, clientY: rect.top + 100,
      deltaMode: 0, deltaY: -120, preventDefault() {},
    });
    assert.equal(3.6 / renderer.camera.viewportWidth, 10000);
    renderer.render("full");
    assert.equal(canvas.dataset.precision, "double-single");
    assert.equal(renderer.progressive, null);
    assert.equal(renderer.references.worker, null);
    assert.ok(canvas.width * canvas.height < 702_000);
    renderer.focus(-0.75, 0.125, 1);
    renderer.render("full");
    assert.ok(canvas.width * canvas.height < 702_000);
    canvas.clientWidth = 100;
    canvas.clientHeight = 100;
    renderer.resizeDrawingBuffer("full");
    assert.equal(canvas.width, 200);
    assert.equal(canvas.height, 200);
  }, { devicePixelRatio: 3, matchMedia: () => ({ matches: true }) });
});
