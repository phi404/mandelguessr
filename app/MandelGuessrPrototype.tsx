"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { FractalViewportHandle } from "./fractal/FractalViewport";
import type {
  ViewSnapshot,
  ZoomLimits,
} from "./fractal/types";
import type { MandelbrotPaletteId } from "./fractal/mandelbrot-palettes";
import { markerPosition } from "./game/MapMarkers";
import { ExploreScreen } from "./game/ExploreScreen";
import {
  InformationDialog,
  NavigationMenu,
  SettingsDialog,
  ShareDialog,
} from "./game/GameOverlays";
import { PlayScreen } from "./game/PlayScreen";
import {
  FinalResultScreen,
  RoundResultScreen,
} from "./game/ResultScreens";
import {
  CreationScreen,
  HomeScreen,
  NewGameScreen,
} from "./game/SetupScreens";
import {
  createInitialGameSession,
  gameSessionReducer,
  type CreationRequest,
} from "./game/game-session";
import {
  createQuestionZoomLimits,
  DEFAULT_GAME_RULES,
  EXPLORATION_MIN_ZOOM,
  explorationZoomLimit,
  isValidMagnification,
  isValidRoundCount,
  questionViewportInteraction,
  type GameRules,
} from "./game/game-rules";
import { createNextGameSeed } from "./game/seed";
import { rulesSummary, targetOf } from "./game/game-display";
import { generateRoundQuestions, QuestionGenerationError } from "./game/question-generator-client";
import { useLanguage } from "./i18n/LanguageProvider";
import { formatCoordinateDistance } from "./game/formatting";
import {
  DEFAULT_USER_SETTINGS,
  loadGameRules,
  loadUserSettings,
  saveGameRules,
  saveUserSettings,
  type UserSettings,
} from "./game/preferences";
import {
  appendPlaytestRound,
  clearPlaytestData,
  createSessionId,
  playtestSampleCount,
  setPlaytestRoundFeedback,
  type QuestionFeedback,
} from "./game/playtest-data";
import {
  MAX_ROUND_SCORE,
  scoreGuess,
} from "./game/score-guess";
import {
  buildHomeUrl,
  formatShareResult,
} from "./game/share-game";
const EXPLORE_ZOOM_LIMITS: ZoomLimits = {
  min: EXPLORATION_MIN_ZOOM,
  max: explorationZoomLimit(),
};

export function MandelGuessrPrototype() {
  const { t, language, number } = useLanguage();
  const mapRef = useRef<FractalViewportHandle>(null);
  const exploreRef = useRef<FractalViewportHandle>(null);
  const questionRef = useRef<FractalViewportHandle>(null);
  const playStageRef = useRef<HTMLElement | null>(null);
  const roundStartedAtRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const pausedDurationRef = useRef(0);
  const creationInFlightRef = useRef(false);
  const creationTokenRef = useRef(0);
  const creationAbortRef = useRef<AbortController | null>(null);

  const [session, dispatchSession] = useReducer(
    gameSessionReducer,
    null,
    () => createInitialGameSession(createSessionId()),
  );
  const {
    phase,
    gameRules,
    questions,
    records,
    roundIndex,
    guess,
    generationError: creationError,
    gameSeed,
    sessionId,
    pendingCreation: lastCreation,
    overlay,
  } = session;
  const menuOpen = overlay === "menu";
  const informationOpen = overlay === "information";
  const settingsOpen = overlay === "settings";
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [mapView, setMapView] = useState<ViewSnapshot | null>(null);
  const [exploreView, setExploreView] = useState<ViewSnapshot | null>(null);
  const [questionView, setQuestionView] = useState<ViewSnapshot | null>(null);
  const [selectedBreakdown, setSelectedBreakdown] = useState(0);
  const [magnificationInput, setMagnificationInput] = useState(String(DEFAULT_GAME_RULES.magnification));
  const [roundCountInput, setRoundCountInput] = useState(String(DEFAULT_GAME_RULES.roundCount));
  const [shareOpen, setShareOpen] = useState(false);
  const [debugUi, setDebugUi] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [roundFeedback, setRoundFeedback] = useState<Record<number, QuestionFeedback>>({});

  const parsedMagnification = Number(magnificationInput);
  const parsedRoundCount = Number(roundCountInput);
  const magnificationIsValid = isValidMagnification(parsedMagnification);
  const roundCountIsValid = isValidRoundCount(parsedRoundCount);
  const rulesAreValid = magnificationIsValid && roundCountIsValid;
  const question = questions[roundIndex] ?? null;
  const latestRecord = records.at(-1) ?? null;

  const explorationZoomLimits = useMemo<ZoomLimits>(() => ({
    min: EXPLORATION_MIN_ZOOM,
    max: explorationZoomLimit(),
  }), []);
  const questionZoomLimits = useMemo(
    () => createQuestionZoomLimits(gameRules.magnification),
    [gameRules.magnification],
  );
  const questionInteraction = useMemo(
    () => questionViewportInteraction({
      questionPanAllowed: gameRules.questionPanAllowed,
      questionInspectAllowed: gameRules.questionInspectAllowed,
    }),
    [gameRules.questionInspectAllowed, gameRules.questionPanAllowed],
  );
  const guessMarker = useMemo(() => markerPosition(guess, mapView), [guess, mapView]);
  const questionTargetMarker = useMemo(
    () => markerPosition(question ? targetOf(question) : null, questionView),
    [question, questionView],
  );

  const startRoundClock = () => {
    roundStartedAtRef.current = performance.now();
    pauseStartedAtRef.current = null;
    pausedDurationRef.current = 0;
  };
  const pauseRoundClock = () => {
    if (pauseStartedAtRef.current === null) pauseStartedAtRef.current = performance.now();
  };
  const resumeRoundClock = () => {
    if (pauseStartedAtRef.current !== null) {
      pausedDurationRef.current += performance.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
  };

  const startGame = useCallback(async (request: CreationRequest) => {
    if (creationInFlightRef.current) return;
    creationInFlightRef.current = true;
    const controller = new AbortController();
    creationAbortRef.current = controller;
    const token = creationTokenRef.current + 1;
    creationTokenRef.current = token;
    dispatchSession({ type: "START_GENERATION", request });
    setSettingsError(null);

    try {
      const generated = await generateRoundQuestions(request.rules, request.seed, {
        paletteId: loadUserSettings().paletteId, signal: controller.signal,
      });
      if (creationTokenRef.current !== token) return;

      if (request.persistRules) saveGameRules(request.rules);
      setMapView(null);
      setQuestionView(null);
      setRoundFeedback({});
      setSelectedBreakdown(0);
      setShareOpen(false);
      dispatchSession({
        type: "GENERATION_SUCCEEDED",
        request,
        questions: generated,
        sessionId: createSessionId(),
      });
      roundStartedAtRef.current = performance.now();
      pauseStartedAtRef.current = null;
      pausedDurationRef.current = 0;
    } catch (cause) {
      if (creationTokenRef.current !== token) return;
      dispatchSession({
        type: "GENERATION_FAILED",
        message:
          cause instanceof QuestionGenerationError ? cause.code : "generation-failed",
      });
    } finally {
      if (creationTokenRef.current === token) {
        creationInFlightRef.current = false;
        creationAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => () => { creationAbortRef.current?.abort(); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedRules = loadGameRules();
      const storedUserSettings = loadUserSettings();
      const parameters = new URL(window.location.href).searchParams;

      setUserSettings(storedUserSettings);
      setSampleCount(playtestSampleCount());
      setDebugUi(
        parameters.get("debug") === "1" ||
        parameters.get("debug") === "true" ||
        import.meta.env.DEV,
      );

      const initialRules = storedRules;
      dispatchSession({ type: "SET_RULES", rules: initialRules });
      setMagnificationInput(String(initialRules.magnification));
      setRoundCountInput(String(initialRules.roundCount));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startGame]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (shareOpen) {
        setShareOpen(false);
        return;
      }
      if (informationOpen) {
        dispatchSession({ type: "CLOSE_OVERLAY" });
        if (phase === "play") resumeRoundClock();
        return;
      }
      if (settingsOpen) {
        dispatchSession({ type: "CLOSE_OVERLAY" });
        if (phase === "play") resumeRoundClock();
        return;
      }
      if (menuOpen) {
        dispatchSession({ type: "CLOSE_OVERLAY" });
        if (phase === "play") resumeRoundClock();
      } else {
        if (phase === "play") pauseRoundClock();
        dispatchSession({ type: "OPEN_OVERLAY", overlay: "menu" });
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [informationOpen, menuOpen, phase, settingsOpen, shareOpen]);

  const updateGameRules = (patch: Partial<GameRules>) => {
    const nextRules = { ...gameRules, ...patch };
    dispatchSession({ type: "SET_RULES", rules: nextRules });
    saveGameRules(nextRules);
  };
  const updatePalette = (paletteId: MandelbrotPaletteId) => {
    const nextSettings = { paletteId };
    setUserSettings(nextSettings);
    saveUserSettings(nextSettings);
  };

  const startConfiguredGame = () => {
    if (!rulesAreValid) {
      setSettingsError("settings-range");
      return;
    }
    const rules = {
      ...gameRules,
      magnification: parsedMagnification,
      roundCount: parsedRoundCount,
    };
    void startGame({ rules, seed: createNextGameSeed(null), persistRules: true });
  };
  const playAgain = () => {
    void startGame({
      rules: gameRules,
      seed: createNextGameSeed(gameSeed),
      persistRules: false,
    });
  };

  const submitGuess = () => {
    if (!guess || !question) return;
    const target = targetOf(question);
    const score = scoreGuess(question.camera, guess, target);
    const record = { question, guess, score };
    const questionPanDistance = questionView
      ? Math.hypot(
          questionView.centerRe - question.camera.centerRe,
          questionView.centerIm - question.camera.centerIm,
        ) / question.camera.viewportWidth
      : 0;

    appendPlaytestRound({
      sessionId,
      gameSeed: gameSeed ?? 0,
      roundIndex,
      gameRules,
      question: {
        id: question.id,
        camera: question.camera,
        magnification: question.magnification,
        generation: question.generation,
        ...(question.boundaryCell ? {
          gridSize: question.boundaryCell.gridSize,
          cellColumn: question.boundaryCell.column,
          cellRow: question.boundaryCell.row,
        } : {}),
      },
      result: {
        points: score.points,
        coordinateDistance: score.coordinateDistance,
        normalizedDistance: score.normalizedDistance,
      },
      behavior: {
        elapsedMs: Math.max(0, performance.now() - roundStartedAtRef.current - pausedDurationRef.current),
        mapZoom: mapView?.zoom ?? null,
        mapZoomRatio: mapView?.zoom ? mapView.zoom / gameRules.magnification : null,
        questionPanDistance,
      },
      device: {
        pixelRatio: window.devicePixelRatio || 1,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        touchPoints: navigator.maxTouchPoints ?? 0,
        rendererPrecision: mapView?.precision ?? null,
      },
    });
    setSampleCount(playtestSampleCount());
    dispatchSession({ type: "SUBMIT_GUESS", record });
  };

  const continueGame = () => {
    if (roundIndex === questions.length - 1) {
      setSelectedBreakdown(Math.max(0, records.length - 1));
      dispatchSession({ type: "CONTINUE" });
      return;
    }
    setMapView(null);
    setQuestionView(null);
    startRoundClock();
    dispatchSession({ type: "CONTINUE" });
  };

  const recordQuestionFeedback = (feedback: QuestionFeedback) => {
    setRoundFeedback((current) => ({ ...current, [roundIndex]: feedback }));
    setPlaytestRoundFeedback(sessionId, roundIndex, feedback);
  };

  const gameInProgress = phase === "play" || phase === "round-result" || phase === "creating";
  const clearGameState = (nextPhase: "home" | "new-game" | "explore") => {
    creationTokenRef.current += 1;
    creationInFlightRef.current = false;
    setMapView(null);
    setQuestionView(null);
    setRoundFeedback({});
    setShareOpen(false);
    dispatchSession({ type: "NAVIGATE", phase: nextPhase });
  };
  const confirmLeavingGame = () => !gameInProgress || window.confirm(t("leaveGame"));
  const goHome = () => {
    if (!confirmLeavingGame()) return;
    clearGameState("home");
  };
  const goToNewGame = () => {
    if (!confirmLeavingGame()) return;
    clearGameState("new-game");
    setMagnificationInput(String(gameRules.magnification));
    setRoundCountInput(String(gameRules.roundCount));
  };
  const goToExplore = () => {
    if (!confirmLeavingGame()) return;
    clearGameState("explore");
    setExploreView(null);
  };
  const openMenu = () => {
    if (phase === "play") pauseRoundClock();
    dispatchSession({ type: "OPEN_OVERLAY", overlay: "menu" });
  };
  const closeMenu = () => {
    dispatchSession({ type: "CLOSE_OVERLAY" });
    if (phase === "play") resumeRoundClock();
  };
  const openInformation = () => {
    if (phase === "play" && !menuOpen) pauseRoundClock();
    dispatchSession({ type: "OPEN_OVERLAY", overlay: "information" });
  };
  const closeInformation = () => {
    dispatchSession({ type: "CLOSE_OVERLAY" });
    if (phase === "play") resumeRoundClock();
  };
  const openSettings = () => {
    if (phase === "play" && !menuOpen) pauseRoundClock();
    dispatchSession({ type: "OPEN_OVERLAY", overlay: "settings" });
  };
  const closeSettings = () => {
    dispatchSession({ type: "CLOSE_OVERLAY" });
    if (phase === "play") resumeRoundClock();
  };
  const dialogToMenu = () => {
    dispatchSession({ type: "OPEN_OVERLAY", overlay: "menu" });
  };
  const clearCollectedData = () => {
    clearPlaytestData();
    setSampleCount(0);
  };

  const gameMenuLabel = gameSeed !== null ? rulesSummary(gameRules, language) : undefined;
  const commonOverlays = (
    <>
      <NavigationMenu
        open={menuOpen}
        phase={phase}
        gameLabel={gameMenuLabel}
        onClose={closeMenu}
        onHome={goHome}
        onNewGame={goToNewGame}
        onExplore={goToExplore}
        onInformation={openInformation}
        onSettings={openSettings}
      />
      <InformationDialog
        open={informationOpen}
        debug={debugUi}
        sampleCount={sampleCount}
        onClose={closeInformation}
        onMenu={dialogToMenu}
        onClearData={clearCollectedData}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={userSettings}
        onPalette={updatePalette}
        onClose={closeSettings}
        onMenu={dialogToMenu}
      />
    </>
  );

  const totalScore = records.reduce((sum, record) => sum + record.score.points, 0);
  const averageScore = records.length > 0 ? Math.round(totalScore / records.length) : 0;
  let shareDialog = null;
  if (shareOpen && records.length > 0) {
    const text = formatShareResult({
      scores: records.map((record) => record.score),
      rules: gameRules,
      homeUrl: buildHomeUrl(),
      language,
    });
    shareDialog = (
      <ShareDialog
        score={`${number(totalScore)} / ${number(MAX_ROUND_SCORE * records.length)}`}
        secondary={`${t("averageDistance")} ${formatCoordinateDistance(records.reduce((sum, record) => sum + record.score.coordinateDistance, 0) / records.length)}`}
        text={text}
        onClose={() => setShareOpen(false)}
      />
    );
  }

  if (phase === "home") {
    return (
      <HomeScreen
        paletteId={userSettings.paletteId}
        onHome={goHome}
        onMenu={openMenu}
        onPlay={() => dispatchSession({ type: "SHOW_SETUP", phase: "new-game" })}
        onExplore={() => dispatchSession({ type: "SHOW_SETUP", phase: "explore" })}
        overlays={commonOverlays}
      />
    );
  }

  if (phase === "new-game") {
    return (
      <NewGameScreen
        paletteId={userSettings.paletteId}
        onHome={goHome}
        onMenu={openMenu}
        overlays={commonOverlays}
        gameRules={gameRules}
        parsedMagnification={parsedMagnification}
        parsedRoundCount={parsedRoundCount}
        magnificationInput={magnificationInput}
        roundCountInput={roundCountInput}
        magnificationIsValid={magnificationIsValid}
        roundCountIsValid={roundCountIsValid}
        rulesAreValid={rulesAreValid}
        settingsError={settingsError}
        onMagnificationInput={setMagnificationInput}
        onRoundCountInput={setRoundCountInput}
        onRulesChange={updateGameRules}
        onStart={startConfiguredGame}
      />
    );
  }

  if (phase === "creating" || phase === "creation-error") {
    return (
      <CreationScreen
        phase={phase}
        paletteId={userSettings.paletteId}
        onHome={goHome}
        onMenu={openMenu}
        overlays={commonOverlays}
        creationError={creationError}
        lastCreation={lastCreation}
        onRetry={(request) => void startGame(request)}
        onNewGame={goToNewGame}
      />
    );
  }
  if (phase === "explore") {
    return (
      <ExploreScreen
        viewportRef={exploreRef}
        view={exploreView}
        zoomLimits={EXPLORE_ZOOM_LIMITS}
        paletteId={userSettings.paletteId}
        onViewChange={setExploreView}
        onHome={goHome}
        onMenu={openMenu}
        overlays={commonOverlays}
      />
    );
  }
  if (phase === "round-result" && latestRecord) {
    return (
      <RoundResultScreen
        record={latestRecord}
        roundIndex={roundIndex}
        totalRounds={questions.length}
        isLastRound={roundIndex === questions.length - 1}
        paletteId={userSettings.paletteId}
        debug={debugUi}
        feedback={roundFeedback[roundIndex]}
        onFeedback={recordQuestionFeedback}
        onContinue={continueGame}
        onHome={goHome}
        onMenu={openMenu}
        overlays={commonOverlays}
      />
    );
  }

  if (phase === "final-result" && records.length > 0) {
    return (
      <FinalResultScreen
        records={records}
        selectedBreakdown={selectedBreakdown}
        totalScore={totalScore}
        averageScore={averageScore}
        gameRules={gameRules}
        paletteId={userSettings.paletteId}
        onSelectRound={setSelectedBreakdown}
        onPlayAgain={playAgain}
        onShare={() => setShareOpen(true)}
        onNewGame={goToNewGame}
        onHome={goHome}
        onMenu={openMenu}
        overlays={commonOverlays}
        shareDialog={shareDialog}
      />
    );
  }
  if (!question) return null;

  return (
    <PlayScreen
      mapRef={mapRef}
      questionRef={questionRef}
      playStageRef={playStageRef}
      question={question}
      roundIndex={roundIndex}
      totalRounds={questions.length}
      gameRules={gameRules}
      guess={guess}
      mapView={mapView}
      questionView={questionView}
      guessMarker={guessMarker}
      questionTargetMarker={questionTargetMarker}
      explorationZoomLimits={explorationZoomLimits}
      questionZoomLimits={questionZoomLimits}
      questionInteraction={questionInteraction}
      paletteId={userSettings.paletteId}
      onMapViewChange={setMapView}
      onQuestionViewChange={setQuestionView}
      onGuess={(coordinate) =>
        dispatchSession({ type: "SET_GUESS", guess: coordinate })
      }
      onSubmit={submitGuess}
      onHome={goHome}
      onMenu={openMenu}
      overlays={commonOverlays}
    />
  );
}
