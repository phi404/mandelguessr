import { formatRoundCount, type GameRules } from "./game-rules";
import { MAX_ROUND_SCORE, type GuessScore } from "./score-guess";

type ShareResult = {
  scores: Pick<GuessScore, "points">[];
  rules: GameRules;
  homeUrl: string;
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

export function formatShareResult({ scores, rules, homeUrl }: ShareResult) {
  const roundCount = scores.length;
  const totalScore = scores.reduce((sum, score) => sum + score.points, 0);
  const maximumScore = MAX_ROUND_SCORE * roundCount;
  const averageLine = roundCount > 1
    ? `\nAVG ${Math.round(totalScore / roundCount).toLocaleString()}`
    : "";

  return [
    "MandelGuessr",
    "",
    `${totalScore.toLocaleString()} / ${maximumScore.toLocaleString()}${averageLine}`,
    "",
    `×${rules.magnification} · ${formatRoundCount(roundCount)}`,
    `PAN ${rules.questionPanAllowed ? "ON" : "OFF"} · INSPECT ${rules.questionInspectAllowed ? "ON" : "OFF"}`,
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
