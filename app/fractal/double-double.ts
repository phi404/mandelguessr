/** Non-overlapping binary64 components, high part first. */
export type DoubleDouble = readonly [number, number];

export function ddAdd(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  const sum = a[0] + b[0];
  const virtualB = sum - a[0];
  const error = (a[0] - (sum - virtualB)) + (b[0] - virtualB) + a[1] + b[1];
  const high = sum + error;
  return [high, error - (high - sum)];
}

export function ddSubtract(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  return ddAdd(a, [-b[0], -b[1]]);
}

export function ddMultiply(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  const product = a[0] * b[0];
  const splitA = 134217729 * a[0];
  const highA = splitA - (splitA - a[0]);
  const lowA = a[0] - highA;
  const splitB = 134217729 * b[0];
  const highB = splitB - (splitB - b[0]);
  const lowB = b[0] - highB;
  const error = ((highA * highB - product) + highA * lowB + lowA * highB)
    + lowA * lowB + a[0] * b[1] + a[1] * b[0] + a[1] * b[1];
  const high = product + error;
  return [high, error - (high - product)];
}

export function ddNumber(value: DoubleDouble) {
  return value[0] + value[1];
}

/** Round the exact sum, without losing the low component to Number conversion. */
export function ddToFixed(value: DoubleDouble, digits: number): string {
  const parts = value.map(binaryParts);
  const exponent = Math.min(parts[0].exponent, parts[1].exponent);
  let numerator = ((parts[0].mantissa << BigInt(parts[0].exponent - exponent))
    + (parts[1].mantissa << BigInt(parts[1].exponent - exponent))) * 10n ** BigInt(digits);
  const negative = numerator < 0n;
  if (negative) numerator = -numerator;
  const rounded = exponent >= 0 ? numerator << BigInt(exponent)
    : (numerator + (1n << BigInt(-exponent - 1))) >> BigInt(-exponent);
  const text = rounded.toString().padStart(digits + 1, "0");
  return `${negative && rounded !== 0n ? "-" : ""}${digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text}`;
}

function binaryParts(value: number) {
  if (!Number.isFinite(value)) throw new RangeError("Coordinate must be finite.");
  if (value === 0) return { mantissa: 0n, exponent: -1074 };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  return { mantissa: bits >> 63n ? -mantissa : mantissa, exponent: exponent ? exponent - 1075 : -1074 };
}
