import type { GameRules } from "./game-rules";
import { MAX_ROUND_SCORE, type GuessScore } from "./score-guess";
import { formatCoordinateDistance } from "./formatting";
import { formatRoundSummary, translate, type Language } from "../i18n/messages";

type ShareResult = {
  scores: (Pick<GuessScore, "points"> & Partial<Pick<GuessScore, "coordinateDistance">>)[];
  rules: GameRules;
  homeUrl: string;
  language?: Language;
};

export function buildHomeUrl(currentUrl?: string) {
  const fallback = "https://phi404.github.io/mandelguessr/";
  const url = new URL(
    currentUrl ?? (typeof window === "undefined" ? fallback : window.location.href),
  );
  url.pathname = /^\/mandelguessr(?:\/|$)/.test(url.pathname) ? "/mandelguessr/" : "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function formatShareResult({ scores, rules, homeUrl, language = "en" }: ShareResult) {
  const roundCount = scores.length;
  const totalScore = scores.reduce((sum, score) => sum + score.points, 0);
  const maximumScore = MAX_ROUND_SCORE * roundCount;
  const number = (value: number) => value.toLocaleString(language === "ja" ? "ja-JP" : language);
  const averageLine = roundCount > 1
    ? `\n${translate(language, "averageScore")} ${number(Math.round(totalScore / roundCount))}`
    : "";
  const distanceLine = roundCount > 0 && scores.every(score => Number.isFinite(score.coordinateDistance))
    ? `${translate(language, "averageDistance")} ${formatCoordinateDistance(scores.reduce((sum, score) => sum + score.coordinateDistance!, 0) / roundCount)}`
    : "";

  return [
    "MandelGuessr",
    "",
    `${number(totalScore)} / ${number(maximumScore)}${averageLine}`,
    ...(distanceLine ? [distanceLine] : []),
    "",
    `×${rules.magnification} · ${formatRoundSummary(language, roundCount)}`,
    `${translate(language, "panSummary", { state: translate(language, rules.questionPanAllowed ? "on" : "off") })} · ${translate(language, "zoomSummary", { state: translate(language, rules.questionInspectAllowed ? "on" : "off") })}`,
    "",
    "#MandelGuessr",
    homeUrl,
  ].join("\n");
}

export async function copyShareResult(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function xShareIntent(text: string) {
  const intent = new URL("https://twitter.com/intent/tweet");
  intent.searchParams.set("text", text);
  return intent.toString();
}
