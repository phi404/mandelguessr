import { ENGLISH_LABELS } from "./english-labels";

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
  "homeInstructions": "形の特徴を手がかりに、同じ場所を探してください。",
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
  "panTarget": "ターゲットの移動",
  "panHelp": "出題画像をドラッグして周辺を観察できます。",
  "panAllowed": "ターゲットの移動を許可",
  "zoomTarget": "追加ズーム",
  "zoomHelp": "出題時の倍率から、さらにターゲットを拡大できます。",
  "zoomAllowed": "ターゲットの追加拡大を許可",
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
  "expandTarget": "ターゲットウィンドウを拡大",
  "restoreTarget": "ターゲットウィンドウを通常サイズに戻す",
  "expand": "拡大する",
  "restoreSize": "通常サイズに戻す",
  "drag": "ドラッグ",
  "wheelPinch": "ホイール / ピンチ",
  "center": "中央",
  "centerCoordinates": "画面中央の座標",
  "resultMap": "回答と正解を示す結果マップ",
  "roundResult": "ラウンド結果",
  "distanceError": "距離誤差",
  "averageDistance": "平均距離誤差",
  "distanceHelp": "複素平面上の、回答地点と正解地点の直線距離です。",
  "meanDistanceHelp": "各ラウンドの距離誤差を足し、ラウンド数で割った値です。",
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
  "howToPlayText": "TARGETと同じ場所を探し、地図上の地点を選んでGUESSで回答します。正解に近いほど高得点です。1問あたり最大5,000点です。",
  "howToExplore": "「探索」では、回答をせずに集合を自由に移動・拡大できます。",
  "distanceExplanation": "結果に表示される距離誤差は、複素平面上の回答地点と正解地点を結ぶ直線の長さです。0なら同じ地点です。",
  "controls": "操作",
  "move": "移動",
  "zoom": "ズーム",
  "selectLocation": "地点選択",
  "clickTap": "クリック / タップ",
  "windowControl": "タイトルバーをドラッグして移動。右上のボタンでウィンドウを拡大できます。",
  "rulesControl": "ゲーム設定でターゲットの移動・追加ズームを許可できます。出題時より広い範囲へ縮小することはできません。",
  "mandelbrot": "マンデルブロ集合",
  "mandelbrotPlane": "画面は複素平面です。横軸が実部、縦軸が虚部を表し、一つの複素数 c が画面上の一点に対応します。",
  "mandelbrotIteration": "その点の c を固定し、0から「数を2乗して c を足す」という計算を繰り返します。",
  "mandelbrotDefinition": "計算を何回続けても値が一定の範囲にとどまる、そのような c を集めたものがマンデルブロ集合です。",
  "exampleZero": "0 → 0 → 0 → …。0のままなので集合に含まれます。",
  "exampleMinusOne": "0 → −1 → 0 → −1 → …。同じ値を繰り返すので集合に含まれます。",
  "exampleOne": "0 → 1 → 2 → 5 → 26 → …。際限なく大きくなるので集合に含まれません。",
  "mandelbrotColors": "黒い部分は、設定された計算回数では発散が確認されなかった点を表す近似です。周囲の色は、値が遠くへ離れていく速さなどを表しています。",
  "mandelbrotDetail": "境界を拡大すると、枝や渦、元の集合に似た小さな形が現れます。このゲームでは、そうした形を場所の手がかりにします。",
  "credits": "クレジット",
  "creator": "制作",
  "paletteCredits": "パレットの出典・ライセンス",
  "localData": "プレイ記録",
  "localDataCount": "この端末内のみ · {rounds}",
  "export": "書き出す",
  "clear": "消去",
  "rendererRetry": "再試行"
} as const;

export type LocalizedMessages = Record<keyof typeof ja, string>;

const en: LocalizedMessages = {
  "menu": "Menu",
  "information": "Information",
  "language": "Language",
  "colors": "Colors",
  "homeDescription": "A game about locating close-up views of the Mandelbrot set.",
  "homeInstructions": "Use the shapes in the image to find the same location on the complex plane.",
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
  "panTarget": "Move target image",
  "panHelp": "Drag the target image to look around.",
  "panAllowed": "Allow panning in the target image",
  "zoomTarget": "Extra zoom",
  "zoomHelp": "Zoom further into the target image from its starting magnification.",
  "zoomAllowed": "Allow extra zoom in the target image",
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
  "expandTarget": "Enlarge the target window",
  "restoreTarget": "Restore the target window to its normal size",
  "expand": "Enlarge",
  "restoreSize": "Normal size",
  "drag": "Drag",
  "wheelPinch": "Scroll / pinch",
  "center": "Center",
  "centerCoordinates": "Coordinates at the center of the view",
  "resultMap": "Result map showing your guess and the target",
  "roundResult": "Round result",
  "distanceError": "Distance error",
  "averageDistance": "Mean distance error",
  "distanceHelp": "The straight-line distance between your guess and the target on the complex plane.",
  "meanDistanceHelp": "The sum of the distance errors divided by the number of rounds.",
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
  "howToPlayText": "Find the location shown in TARGET, select it on the map, and press GUESS. The closer you are to the target, the higher your score, up to 5,000 points per round.",
  "howToExplore": "Explore lets you pan and zoom around the set freely, without placing a guess.",
  "distanceExplanation": "Distance error is the straight-line distance between your guess and the target on the complex plane. A distance of 0 means the two locations are identical.",
  "controls": "Controls",
  "move": "Move",
  "zoom": "Zoom",
  "selectLocation": "Select location",
  "clickTap": "Click / tap",
  "windowControl": "Drag the title bar to move the target window. Use the button at the top right to enlarge it.",
  "rulesControl": "Game settings can allow panning and extra zoom in the target image. You cannot zoom out beyond its starting view.",
  "mandelbrot": "The Mandelbrot set",
  "mandelbrotPlane": "The map is the complex plane. The horizontal axis is the real part and the vertical axis is the imaginary part. Each complex number c corresponds to a point on the map.",
  "mandelbrotIteration": "Keep c fixed. Starting at 0, repeatedly square the current value and add c.",
  "mandelbrotDefinition": "The Mandelbrot set consists of all values of c for which this sequence stays within a bounded region, no matter how many times the calculation is repeated.",
  "exampleZero": "0 → 0 → 0 → … stays at 0, so this point belongs to the set.",
  "exampleMinusOne": "0 → −1 → 0 → −1 → … repeats the same two values, so this point belongs to the set.",
  "exampleOne": "0 → 1 → 2 → 5 → 26 → … grows without bound, so this point does not belong to the set.",
  "mandelbrotColors": "The black region approximates the set: it contains points where no escape was detected within the chosen number of iterations. Colors outside it show how quickly the values escape, among other details.",
  "mandelbrotDetail": "Zooming into the boundary reveals branches, spirals, and smaller shapes resembling the whole set. These shapes are the clues you use in the game.",
  "credits": "Credits",
  "creator": "Created by",
  "paletteCredits": "Palette sources and licenses",
  "localData": "Play records",
  "localDataCount": "Only on this device · {rounds}",
  "export": "Export",
  "clear": "Clear",
  "rendererRetry": "Try again"
};

export type MessageKey = keyof typeof ja | keyof typeof ENGLISH_LABELS;

export const messages = {

  ja: { ...ja, ...ENGLISH_LABELS }, en: { ...en, ...ENGLISH_LABELS },

  "zh-CN": { ...zh, ...ENGLISH_LABELS }, ko: { ...ko, ...ENGLISH_LABELS },

  es: { ...es, ...ENGLISH_LABELS }, fr: { ...fr, ...ENGLISH_LABELS },

  de: { ...de, ...ENGLISH_LABELS }, "pt-BR": { ...pt, ...ENGLISH_LABELS },

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

const singularRounds: Partial<Record<Language, string>> = { en: "1 round", es: "1 ronda", fr: "1 manche", de: "1 Runde", "pt-BR": "1 rodada" };

export function translate(language: Language, key: MessageKey, values: Record<string, string | number> = {}): string {

  if (key === "roundCount" && values.count === 1 && singularRounds[language]) return singularRounds[language]!;

  if (key === "localDataCount") values = { ...values, rounds: translate(language, "roundCount", { count: values.count }) };

  return messages[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));

}
