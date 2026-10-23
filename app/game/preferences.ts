import {
  DEFAULT_GAME_RULES,
  parseGameRules,
  parseLegacyGameRules,
  type GameRules,
} from "./game-rules";
import {
  DEFAULT_MANDELBROT_PALETTE_ID,
  isMandelbrotPaletteId,
  type MandelbrotPaletteId,
} from "../fractal/mandelbrot-palettes";

const LEGACY_SETTINGS_KEY = "mandelguessr.settings.v1";
const GAME_RULES_KEY = "mandelguessr.game-rules.v1";
const USER_SETTINGS_KEY = "mandelguessr.user-settings.v1";

export type UserSettings = {
  paletteId: MandelbrotPaletteId;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  paletteId: DEFAULT_MANDELBROT_PALETTE_ID,
};

export function loadGameRules(): GameRules {
  if (typeof window === "undefined") return DEFAULT_GAME_RULES;

  try {
    const stored = parseGameRules(JSON.parse(
      window.localStorage.getItem(GAME_RULES_KEY) ?? "null",
    ));
    if (stored) return stored;

    const legacy = parseLegacyGameRules(JSON.parse(
      window.localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "null",
    ));
    if (legacy) return legacy;
  } catch {
    // Invalid or unavailable browser storage falls back to defaults.
  }

  return DEFAULT_GAME_RULES;
}

export function saveGameRules(rules: GameRules) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GAME_RULES_KEY, JSON.stringify(rules));
  } catch {
    // Persistence is optional; play remains available without it.
  }
}

export function loadUserSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_USER_SETTINGS;

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(USER_SETTINGS_KEY) ?? "null",
    ) as Partial<UserSettings> | null;
    if (isMandelbrotPaletteId(stored?.paletteId)) {
      return { paletteId: stored.paletteId };
    }

    const legacy = JSON.parse(
      window.localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "null",
    ) as Partial<UserSettings> | null;
    if (isMandelbrotPaletteId(legacy?.paletteId)) {
      return { paletteId: legacy.paletteId };
    }
  } catch {
    // Invalid or unavailable browser storage falls back to defaults.
  }

  return DEFAULT_USER_SETTINGS;
}

export function saveUserSettings(settings: UserSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is optional; rendering falls back to the default palette.
  }
}
