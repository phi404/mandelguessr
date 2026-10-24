import { ENGLISH_LABELS } from "./english-labels";
import { LOCALIZED_CONTROLS } from "./localized-controls";
import { eo } from "./esperanto";

import { zh, ko, es, fr, de, pt } from "./extra-languages";

export const LANGUAGE_OPTIONS = [
  {
    "value": "ja",
    "label": "日本語"
  },
  {
    "value": "en",
    "label": "English"
  },
  {
    "value": "zh-CN",
    "label": "简体中文"
  },
  {
    "value": "ko",
    "label": "한국어"
  },
  {
    "value": "es",
    "label": "Español"
  },
  {
    "value": "fr",
    "label": "Français"
  },
  {
    "value": "de",
    "label": "Deutsch"
  },
  {
    "value": "pt-BR",
    "label": "Português (Brasil)"
  },
  {
    "value": "eo",
    "label": "Esperanto"
  }
] as const;

export type Language = (typeof LANGUAGE_OPTIONS)[number]["value"];

export const LANGUAGES: Language[] = LANGUAGE_OPTIONS.map(option => option.value);

const ja = {
  "menu": "メニュー",
  "information": "ガイド",
  "language": "言語",
  "colors": "配色",
  "homeDescription": "マンデルブロ集合を拡大した画像から、複素平面上の位置を推測するゲームです。",

  "startGame": "位置当てゲームを開始",
  "freeExplore": "自由に探索",
  "overviewImage": "マンデルブロ集合の全体図",
  "gameSettings": "ゲーム設定",
  "magnification": "倍率",
  "magnificationHelp": "出題画像の倍率です。大きいほど狭い範囲が出題されます。",
  "magnificationPresets": "出題倍率のプリセット",
  "rounds": "ラウンド数",
  "roundPresets": "ラウンド数のプリセット",
  "roundCount": "{count}問",
  "custom": "カスタム",
  "panTarget": "パン",
  "panHelp": "出題画像をドラッグして周辺を観察できます。",
  "panAllowed": "ターゲットのパンを許可",
  "zoomTarget": "ズーム",
  "zoomHelp": "出題時の倍率から、さらにターゲットを拡大できます。",
  "zoomAllowed": "ターゲットのズームを許可",
  "settingsRange": "設定値の範囲を確認してください。",
  "generationFailed": "問題を生成できませんでした。もう一度お試しください。",
  "generationTimeout": "問題の生成に時間がかかっています。もう一度お試しください。",
  "graphicsUnavailable": "問題の描画に必要なWebGL 2を利用できません。対応ブラウザで再試行してください。",
  "rendererUnavailable": "画像を描画できません。WebGL 2対応のブラウザで再試行してください。",
  "leaveGame": "現在のゲームを終了しますか？",
  "guessMap": "推測地点を選択するマンデルブロ集合の探索マップ",
  "exploreMap": "マンデルブロ集合の自由探索マップ",
  "targetImage": "出題されたマンデルブロ集合の局所画像",
  "targetWindow": "ターゲット画像",
  "selectPoint": "地点を選択",
  "submitGuess": "回答を確定",
  "resetMap": "探索マップを全体表示へ戻す",
  "overview": "全体表示",
  "resetTarget": "ターゲットを初期表示へ戻す",
  "resetView": "初期表示へ戻す",

  "restoreTarget": "ターゲットウィンドウを復元",

  "drag": "ドラッグ",
  "wheelPinch": "ホイール / ピンチ",

  "centerCoordinates": "画面中央の座標",
  "resultMap": "回答と正解を示す結果マップ",
  "roundResult": "ラウンド結果",
  "distanceError": "距離",
  "averageDistance": "平均距離",
  "distanceHelp": "複素平面上の、回答地点と正解地点の直線距離です。",
  "meanDistanceHelp": "各ラウンドの距離を足し、ラウンド数で割った値です。",
  "coordinates": "座標",
  "gameDetails": "ゲーム情報",
  "targetFeedback": "ターゲットの評価",
  "targetQuality": "ターゲットの質",
  "goodQuestion": "良問",
  "tooHard": "難しすぎる",
  "poorFrame": "表示不良",
  "paletteGroup": "パレット",
  "officialPalettes": "配色パレット",
  "howToPlay": "遊び方",
  "howToPlayText": "{target}と同じ場所を探し、地図上の地点を選んで{action}で回答します。正解に近いほど高得点です。1問あたり最大5,000点です。",
  "howToExplore": "{explore}では、回答をせずに集合を自由にパン・ズームできます。",
  "distanceExplanation": "結果に表示される距離は、複素平面上の回答地点と正解地点を結ぶ直線の長さです。0なら同じ地点です。",
  "controls": "操作",
  "move": "パン",
  "zoom": "ズーム",
  "selectLocation": "地点選択",
  "clickTap": "クリック / タップ",
  "windowControl": "タイトルバーをドラッグして移動し、左上または右下の角をドラッグしてサイズを変えます。右上のボタンで最小化・復元できます。",
  "rulesControl": "ゲーム設定でターゲットのパン・ズームを許可できます。出題時より広い範囲へ縮小することはできません。",
  "mandelbrot": "マンデルブロ集合",
  "mandelbrotPlane": "画面は複素平面です。横軸が実部、縦軸が虚部を表し、一つの複素数 c が画面上の一点に対応します。",
  "mandelbrotIteration": "その点の c を固定し、0から「数を2乗して c を足す」という計算を繰り返します。",
  "mandelbrotDefinition": "計算を何回続けても値が一定の範囲にとどまる、そのような c を集めたものがマンデルブロ集合です。",
  "exampleZero": "0 → 0 → 0 → …。0のままなので集合に含まれます。",
  "exampleMinusOne": "0 → −1 → 0 → −1 → …。0と−1を交互に取るので集合に含まれます。",
  "exampleOne": "0 → 1 → 2 → 5 → 26 → …。際限なく大きくなるので集合に含まれません。",
  "mandelbrotColors": "黒い部分は、設定された計算回数では発散が確認されなかった点を表す近似です。周囲の色は、値が遠くへ離れていく速さなどを表しています。",

  "credits": "クレジット",
  "creator": "制作",
  "paletteCredits": "パレットの出典・ライセンス",
  "localData": "プレイ記録",
  "localDataCount": "この端末内のみ · {rounds}",
  "export": "書き出す",
  "clear": "消去",
  "minimizeTarget": "ターゲットウィンドウを最小化",
  "resizeTarget": "ターゲットウィンドウのサイズを変更",
  "mandelbrotShapeTitle": "どんな図形か",
  "mandelbrotAppearance": "マンデルブロ集合は、複素平面上のフラクタル図形です。全体を見ると、大きなハート形（カージオイド）の左に円形の領域がつながり、その周囲に小さなふくらみや枝状の構造が続いています。実軸をはさんで上下対称です。",
  "mandelbrotFractalTitle": "拡大すると見えるもの",
  "mandelbrotFractal": "境界を拡大すると、枝分かれや渦、その先のさらに細かな構造が現れます。いくら拡大しても複雑さが尽きない、こうした異なる大きさにわたる構造がフラクタルの特徴です。",
  "mandelbrotSimilarity": "ところどころには、全体によく似た小さな形も現れます。ただし、同じ模様の正確なコピーがどこまでも並んでいるわけではありません。枝や渦の組み合わせは場所ごとに異なり、このゲームではその違いが手がかりになります。",
  "mandelbrotRuleTitle": "形を決める計算",
  "mandelbrotColorsTitle": "黒い部分と周囲の色",
  "furtherReading": "参考",
  "rendererRetry": "再試行"
} as const;

export type LocalizedMessages = Record<keyof typeof ja, string>;

const en: LocalizedMessages = {
  "menu": "Menu",
  "information": "Information",
  "language": "Language",
  "colors": "Colors",
  "homeDescription": "A game about locating close-up views of the Mandelbrot set.",

  "startGame": "Start a guessing game",
  "freeExplore": "Explore freely",
  "overviewImage": "Overview of the Mandelbrot set",
  "gameSettings": "Game settings",
  "magnification": "Magnification",
  "magnificationHelp": "The magnification of the target image. Higher values show a smaller area.",
  "magnificationPresets": "Target magnification presets",
  "rounds": "Rounds",
  "roundPresets": "Round count presets",
  "roundCount": "{count} rounds",
  "custom": "Custom",
  "panTarget": "Pan",
  "panHelp": "Drag the target image to look around.",
  "panAllowed": "Allow panning in the target image",
  "zoomTarget": "Zoom",
  "zoomHelp": "Zoom further into the target image from its starting magnification.",
  "zoomAllowed": "Allow zooming in the target image",
  "settingsRange": "Check that the settings are within the allowed ranges.",
  "generationFailed": "Could not generate the questions. Please try again.",
  "generationTimeout": "Generating the questions is taking too long. Please try again.",
  "graphicsUnavailable": "WebGL 2 is unavailable for generating the images. Please try a browser that supports WebGL 2.",
  "rendererUnavailable": "Could not draw the image. Please try a browser that supports WebGL 2.",
  "leaveGame": "End the current game?",
  "guessMap": "Mandelbrot exploration map for placing your guess",
  "exploreMap": "Free exploration map of the Mandelbrot set",
  "targetImage": "Close-up view of the Mandelbrot set to locate",
  "targetWindow": "Target image",
  "selectPoint": "Select a location",
  "submitGuess": "Submit guess",
  "resetMap": "Reset the exploration map to the overview",
  "overview": "Overview",
  "resetTarget": "Reset the target image",
  "resetView": "Reset view",

  "restoreTarget": "Restore the target window",

  "drag": "Drag",
  "wheelPinch": "Scroll / pinch",

  "centerCoordinates": "Coordinates at the center of the view",
  "resultMap": "Result map showing your guess and the target",
  "roundResult": "Round result",
  "distanceError": "Distance",
  "averageDistance": "Mean distance",
  "distanceHelp": "The straight-line distance between your guess and the target on the complex plane.",
  "meanDistanceHelp": "The sum of the distances divided by the number of rounds.",
  "coordinates": "Coordinates",
  "gameDetails": "Game details",
  "targetFeedback": "Rate the target image",
  "targetQuality": "Target image quality",
  "goodQuestion": "Good question",
  "tooHard": "Too difficult",
  "poorFrame": "Image problem",
  "paletteGroup": "Palette",
  "officialPalettes": "Color palettes",
  "howToPlay": "How to play",
  "howToPlayText": "Find the location shown in {target}, select it on the map, and press {action}. The closer you are to the target, the higher your score, up to 5,000 points per round.",
  "howToExplore": "{explore} lets you pan and zoom around the set freely, without placing a guess.",
  "distanceExplanation": "The displayed distance is the straight-line distance between your guess and the target on the complex plane. A distance of 0 means the two locations are identical.",
  "controls": "Controls",
  "move": "Pan",
  "zoom": "Zoom",
  "selectLocation": "Select location",
  "clickTap": "Click / tap",
  "windowControl": "Drag the title bar to move the window. Drag its top-left or bottom-right corner to resize it. The top-right button minimizes and restores it.",
  "rulesControl": "Game settings can allow panning and zooming in the target image. You cannot zoom out beyond its starting view.",
  "mandelbrot": "The Mandelbrot set",
  "mandelbrotPlane": "The map is the complex plane. The horizontal axis is the real part and the vertical axis is the imaginary part. Each complex number c corresponds to a point on the map.",
  "mandelbrotIteration": "Keep c fixed. Starting at 0, repeatedly square the current value and add c.",
  "mandelbrotDefinition": "The Mandelbrot set consists of all values of c for which this sequence stays within a bounded region, no matter how many times the calculation is repeated.",
  "exampleZero": "0 → 0 → 0 → … stays at 0, so this point belongs to the set.",
  "exampleMinusOne": "0 → −1 → 0 → −1 → … repeats the same two values, so this point belongs to the set.",
  "exampleOne": "0 → 1 → 2 → 5 → 26 → … grows without bound, so this point does not belong to the set.",
  "mandelbrotColors": "The black region approximates the set: it contains points where no escape was detected within the chosen number of iterations. Colors outside it show how quickly the values escape, among other details.",

  "credits": "Credits",
  "creator": "Created by",
  "paletteCredits": "Palette sources and licenses",
  "localData": "Play records",
  "localDataCount": "Only on this device · {rounds}",
  "export": "Export",
  "clear": "Clear",
  "rendererRetry": "Try again",
  "minimizeTarget": "Minimize the target window",
  "resizeTarget": "Resize the target window",
  "mandelbrotShapeTitle": "What the shape looks like",
  "mandelbrotAppearance": "The Mandelbrot set is a fractal in the complex plane. Its main body is a heart-shaped region called a cardioid, joined to a round bulb on the left. Smaller bulbs and branching filaments surround them. The shape is symmetric across the real axis.",
  "mandelbrotFractalTitle": "What zooming reveals",
  "mandelbrotFractal": "Zooming into the boundary reveals branches, spirals and finer structures at ever smaller scales. This complexity across scales is characteristic of a fractal.",
  "mandelbrotSimilarity": "Small shapes resembling the whole set also appear. It is not an exact repetition of one pattern everywhere: the arrangement of branches and spirals varies from place to place. Those differences are useful clues in this game.",
  "mandelbrotRuleTitle": "The rule behind the shape",
  "mandelbrotColorsTitle": "The black region and the colors",
  "furtherReading": "Further reading",
};

export type MessageKey = keyof typeof ja | keyof typeof ENGLISH_LABELS;

export const messages = {
  ja: { ...ja, ...ENGLISH_LABELS },
  en: { ...en, ...ENGLISH_LABELS },
  "zh-CN": { ...zh, ...ENGLISH_LABELS },
  ko: { ...ko, ...ENGLISH_LABELS },
  es: { ...es, ...LOCALIZED_CONTROLS.es },
  fr: { ...fr, ...LOCALIZED_CONTROLS.fr },
  de: { ...de, ...LOCALIZED_CONTROLS.de },
  "pt-BR": { ...pt, ...LOCALIZED_CONTROLS["pt-BR"] },
  eo: { ...eo, ...LOCALIZED_CONTROLS.eo },
};

export const LANGUAGE_STORAGE_KEY = "mandelguessr.language.v1";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGES.includes(value as Language);
}

export function loadLanguage(): Language {
  try {
    const value = typeof window === "undefined" ? null : window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : "ja";
  } catch { return "ja"; }
}

export function saveLanguage(language: Language) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Selection remains available without storage. */ }
}

const singularRounds: Partial<Record<Language, string>> = {
  en: "1 round", es: "1 ronda", fr: "1 manche", de: "1 Runde", "pt-BR": "1 rodada", eo: "1 raŭndo",
};

export function translate(language: Language, key: MessageKey, values: Record<string, string | number> = {}): string {
  if (key === "roundCount" && values.count === 1 && singularRounds[language]) return singularRounds[language]!;
  if (key === "localDataCount") values = { ...values, rounds: translate(language, "roundCount", { count: values.count }) };
  return messages[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

export function formatRoundSummary(language: Language, count: number): string {
  if (language === "ja" || language === "en" || language === "zh-CN" || language === "ko") {
    return count + (count === 1 ? " ROUND" : " ROUNDS");
  }
  return translate(language, "roundCount", { count });
}
