import { formatZoom } from "./formatting";
import type { Camera, ComplexCoordinate } from "../fractal/types";
import { MANDELBROT_VIEW_ASPECT_RATIO } from "../fractal/mandelbrot-domain";
import type { GameRules } from "./game-rules";
import { formatRoundSummary, translate, type Language } from "../i18n/messages";
import type { PrototypeQuestion } from "./question-generator";
import type { RoundRecord } from "./game-session";
import { fitResultCamera } from "./result-map";

export function targetOf(question: PrototypeQuestion): ComplexCoordinate {
  return {
    re: question.camera.centerRe,
    im: question.camera.centerIm,
    ...(question.camera.centerReLow ? { reLow: question.camera.centerReLow } : {}),
    ...(question.camera.centerImLow ? { imLow: question.camera.centerImLow } : {}),
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
    `×${formatZoom(rules.magnification)}`,
    formatRoundSummary(language, rules.roundCount),
    translate(language, "panSummary", { state: translate(language, rules.questionPanAllowed ? "on" : "off") }),
    translate(language, "zoomSummary", { state: translate(language, rules.questionInspectAllowed ? "on" : "off") }),
  ].join(" · ");
}
