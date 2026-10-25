import type { ComplexCoordinate } from "../fractal/types";
import { ddToFixed } from "../fractal/double-double";

function coordinateDigits(zoom: number) {
  return Math.max(6, Math.min(28, 6 + Math.floor(Math.log10(zoom))));
}

export function formatComplex(coordinate: ComplexCoordinate, zoom: number) {
  const digits = coordinateDigits(zoom);
  const real = ddToFixed([coordinate.re, coordinate.reLow ?? 0], digits);
  const imaginary = ddToFixed([coordinate.im, coordinate.imLow ?? 0], digits);
  return `${real} ${imaginary.startsWith("-") ? "−" : "+"} ${imaginary.replace(/^-/, "")}i`;
}

function superscript(value: number) {
  const digits: Record<string, string> = {
    "-": "⁻",
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  return String(value).split("").map((digit) => digits[digit] ?? digit).join("");
}

export function formatCoordinateDistance(distance: number) {
  if (distance === 0) return "0";
  if (distance < 0.000001 || distance >= 1000) {
    const [coefficient, exponent] = distance.toExponential(2).split("e");
    return `${coefficient} × 10${superscript(Number(exponent))}`;
  }
  return distance.toPrecision(6).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, "$1");
}

export function formatZoom(zoom: number) {
  if (zoom >= 1e7) {
    const [coefficient, exponent] = zoom.toExponential(2).split("e");
    return `${Number(coefficient)} × 10${superscript(Number(exponent))}`;
  }
  return Math.max(1, Math.round(zoom)).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
