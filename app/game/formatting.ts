import type { ComplexCoordinate } from "../fractal/types";

function coordinateDigits(zoom: number) {
  return Math.max(6, Math.min(14, 6 + Math.floor(Math.log10(zoom))));
}

function formatCoordinate(value: number, zoom: number) {
  const formatted = value.toFixed(coordinateDigits(zoom));
  return Number(formatted) === 0 ? formatted.replace(/^-/, "") : formatted;
}

export function formatComplex(coordinate: ComplexCoordinate, zoom: number) {
  const imaginary = formatCoordinate(Math.abs(coordinate.im), zoom);
  return `${formatCoordinate(coordinate.re, zoom)} ${coordinate.im < 0 ? "−" : "+"} ${imaginary}i`;
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
  return zoom.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
