import {
  MANDELBROT_COLOR_DENSITY,
  MANDELBROT_FORMULA_BAILOUT_SQUARED,
  MANDELBROT_MAX_ITERATIONS,
  MANDELBROT_POWER,
  MANDELBROT_SMOOTH_BAILOUT,
  MANDELBROT_SMOOTH_INDEX_SCALE,
} from "./mandelbrot-domain";

export const vertexShaderSource = `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
  vec2 position;
  if (gl_VertexID == 0) {
    position = vec2(-1.0, -1.0);
  } else if (gl_VertexID == 1) {
    position = vec2(3.0, -1.0);
  } else {
    position = vec2(-1.0, 3.0);
  }

  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const sharedColorFunctions = `
uniform sampler2D u_palette;
uniform float u_paletteSize;

const float FORMULA_BAILOUT_SQUARED = ${MANDELBROT_FORMULA_BAILOUT_SQUARED.toFixed(1)};
const float SMOOTH_BAILOUT = ${MANDELBROT_SMOOTH_BAILOUT.toFixed(1)};
const float MANDELBROT_POWER = ${MANDELBROT_POWER.toFixed(1)};
const float SMOOTH_INDEX_SCALE = ${MANDELBROT_SMOOTH_INDEX_SCALE.toFixed(2)};
const float COLOR_DENSITY = ${MANDELBROT_COLOR_DENSITY.toFixed(2)};

float commonCyclicPosition(int escapedAt, float magnitudeSquared) {
  // escapedAt is zero-based; +1 is the number of completed loop bodies and
  // therefore the Ultra Fractal #numiter value used by Standard_Smooth.
  float iterations = float(escapedAt) + 1.0;
  float magnitude = sqrt(magnitudeSquared);
  float smoothIndex = SMOOTH_INDEX_SCALE * (
    iterations +
    (log(log(SMOOTH_BAILOUT)) - log(log(magnitude))) /
      log(MANDELBROT_POWER)
  );
  float densityIndex = COLOR_DENSITY * smoothIndex;

  // Ultra Fractal clamps non-positive gradient indices to entry 0. In
  // particular, never apply fract() to a negative transferred index.
  if (!(densityIndex > 0.0)) return 0.0;
  // Built-in Log transfer: ln(1+d). A full cycle satisfies
  // 1+d2 = e*(1+d1), rather than d2 = e*d1 at small density.
  float transferredIndex = log(1.0 + densityIndex);
  if (!(transferredIndex > 0.0)) return 0.0;
  return transferredIndex - floor(transferredIndex);
}

vec3 samplePalette(float cyclicPosition) {
  // RGB8 stores the canonical display-encoded sRGB bytes without automatic
  // sRGB decoding. LINEAR + REPEAT performs explicit cyclic byte-space
  // interpolation, including the final-to-first LUT segment.
  // commonCyclicPosition owns normalization and supplies [0, 1). Keeping the
  // texture itself on REPEAT only blends the final texel back to the first.
  float texelPosition = cyclicPosition * u_paletteSize;
  float textureU = (texelPosition + 0.5) / u_paletteSize;
  return texture(u_palette, vec2(textureU, 0.5)).rgb;
}

vec3 colorFromEscape(int escapedAt, float magnitudeSquared) {
  return samplePalette(commonCyclicPosition(escapedAt, magnitudeSquared));
}
`;

export const fastFragmentShaderSource = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_center;
uniform vec2 u_viewSize;
uniform int u_maxIterations;

const int MAX_ITERATIONS = ${MANDELBROT_MAX_ITERATIONS};
${sharedColorFunctions}

bool isKnownInterior(vec2 c) {
  float x = c.x - 0.25;
  float y2 = c.y * c.y;
  float q = x * x + y2;
  bool mainCardioid = q * (q + x) <= 0.25 * y2;

  float bulbX = c.x + 1.0;
  bool periodTwoBulb = bulbX * bulbX + y2 <= 0.0625;
  return mainCardioid || periodTwoBulb;
}

void main() {
  vec2 c = u_center + (v_uv - 0.5) * u_viewSize;

  if (isKnownInterior(c)) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 z = vec2(0.0);
  int escapedAt = -1;
  float magnitudeSquared = 0.0;

  for (int i = 0; i < MAX_ITERATIONS; i++) {
    if (i >= u_maxIterations) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    magnitudeSquared = dot(z, z);
    if (magnitudeSquared > FORMULA_BAILOUT_SQUARED) {
      escapedAt = i;
      break;
    }
  }

  if (escapedAt < 0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  outColor = vec4(colorFromEscape(escapedAt, magnitudeSquared), 1.0);
}
`;

export const doubleSingleFunctions = `
// A run-time bit mask forces binary32 rounding across driver optimizations.
uniform highp uint u_roundMask;
float dsRound(float value) { return uintBitsToFloat(floatBitsToUint(value) & u_roundMask); }
vec2 dsAdd(vec2 a, vec2 b) {
  float sum = dsRound(a.x + b.x);
  float virtualB = dsRound(sum - a.x);
  float error = dsRound(dsRound(a.x - dsRound(sum - virtualB)) + dsRound(b.x - virtualB));
  error = dsRound(error + dsRound(a.y + b.y));
  float high = dsRound(sum + error);
  return vec2(high, dsRound(error - dsRound(high - sum)));
}
vec2 dsSubtract(vec2 a, vec2 b) { return dsAdd(a, -b); }
vec2 dsMultiply(vec2 a, vec2 b) {
  float product = dsRound(a.x * b.x);
  float highA = uintBitsToFloat(floatBitsToUint(a.x) & 0xfffff000u);
  float highB = uintBitsToFloat(floatBitsToUint(b.x) & 0xfffff000u);
  float lowA = dsRound(a.x - highA);
  float lowB = dsRound(b.x - highB);
  float error = dsRound(dsRound(dsRound(highA * highB) - product) + dsRound(highA * lowB));
  error = dsRound(error + dsRound(lowA * highB));
  error = dsRound(error + dsRound(lowA * lowB));
  error = dsRound(error + dsRound(dsRound(a.x * b.y) + dsRound(a.y * b.x)));
  float high = dsRound(product + error);
  return vec2(high, dsRound(error - dsRound(high - product)));
}
`;

export const preciseFragmentShaderSource = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_centerHigh;
uniform vec2 u_centerLow;
uniform vec2 u_viewSize;
uniform vec2 u_viewSizeLow;
uniform int u_maxIterations;

const int MAX_ITERATIONS = ${MANDELBROT_MAX_ITERATIONS};
const float SPLITTER = 4097.0;
${sharedColorFunctions}

${doubleSingleFunctions}

void main() {
  vec2 centerX = vec2(u_centerHigh.x, u_centerLow.x);
  vec2 centerY = vec2(u_centerHigh.y, u_centerLow.y);
  vec2 cX = dsAdd(centerX, dsMultiply(vec2(v_uv.x-0.5,0.0),vec2(u_viewSize.x,u_viewSizeLow.x)));
  vec2 cY = dsAdd(centerY, dsMultiply(vec2(v_uv.y-0.5,0.0),vec2(u_viewSize.y,u_viewSizeLow.y)));

  vec2 zX = vec2(0.0);
  vec2 zY = vec2(0.0);
  int escapedAt = -1;
  float magnitudeSquared = 0.0;

  for (int i = 0; i < MAX_ITERATIONS; i++) {
    if (i >= u_maxIterations) break;
    vec2 xSquared = dsMultiply(zX, zX);
    vec2 ySquared = dsMultiply(zY, zY);
    vec2 xy = dsMultiply(zX, zY);
    zX = dsAdd(dsSubtract(xSquared, ySquared), cX);
    zY = dsAdd(dsAdd(xy, xy), cY);

    float approximateX = zX.x + zX.y;
    float approximateY = zY.x + zY.y;
    magnitudeSquared = approximateX * approximateX
      + approximateY * approximateY;
    if (magnitudeSquared > FORMULA_BAILOUT_SQUARED) {
      escapedAt = i;
      break;
    }
  }

  if (escapedAt < 0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  outColor = vec4(colorFromEscape(escapedAt, magnitudeSquared), 1.0);
}
`;
