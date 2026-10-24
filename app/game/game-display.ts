import type { Camera, ComplexCoordinate } from "../fractal/types";
import { MANDELBROT_VIEW_ASPECT_RATIO } from "../fractal/mandelbrot-domain";
import { formatRoundCount, type GameRules } from "./game-rules";
import { translate, type Language } from "../i18n/messages";
import type { PrototypeQuestion } from "./question-generator";
import type { RoundRecord } from "./game-session";
import { fitResultCamera } from "./result-map";

export function targetOf(question: PrototypeQuestion): ComplexCoordinate {
  return {
    re: question.camera.centerRe,
    im: question.camera.centerIm,
  };
}

export function revealCamera(record: RoundRecord): Camera {
  const target = targetOf(record.question);
  return fitResultCamera(
    record.guess,
    target,
    1 / MANDELBROT_VIEW_ASPECT_RATIO,
    record.question.camera.viewportWidth * 2.5,
  );
}

export function rulesSummary(rules: GameRules, language: Language = "en") {
  return [
    `×${rules.magnification}`,
    formatRoundCount(rules.roundCount),
    translate(language, "panSummary", { state: rules.questionPanAllowed ? "ON" : "OFF" }),
    translate(language, "zoomSummary", { state: rules.questionInspectAllowed ? "ON" : "OFF" }),
  ].join(" · ");
}
