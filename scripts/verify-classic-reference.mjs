import { pathToFileURL } from "node:url";

const [sharpModulePath, imagePath] = process.argv.slice(2);
if (!sharpModulePath || !imagePath) {
  throw new Error("Usage: node verify-classic-reference.mjs <sharp/lib/index.js> <reference.jpg>");
}
const { default: sharp } = await import(pathToFileURL(sharpModulePath));
const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const controls = [
  [28, [0, 7, 100]],
  [92, [32, 107, 203]],
  [196, [237, 255, 255]],
  [285, [255, 170, 0]],
  [371, [49, 2, 48]],
];

function wrappedPoint(index) {
  const count = controls.length;
  const wrapped = ((index % count) + count) % count;
  const cycle = Math.floor(index / count);
  return [controls[wrapped][0] + cycle * 400, controls[wrapped][1]];
}

function pchipSlope(index, channel) {
  const [previousX, previousRgb] = wrappedPoint(index - 1);
  const [x, rgb] = wrappedPoint(index);
  const [nextX, nextRgb] = wrappedPoint(index + 1);
  const beforeWidth = x - previousX;
  const afterWidth = nextX - x;
  const before = (rgb[channel] - previousRgb[channel]) / beforeWidth;
  const after = (nextRgb[channel] - rgb[channel]) / afterWidth;
  if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) return 0;
  const w1 = 2 * afterWidth + beforeWidth;
  const w2 = afterWidth + 2 * beforeWidth;
  return (w1 + w2) / (w1 / before + w2 / after);
}

function palette(position, interpolation) {
  const x = ((position % 400) + 400) % 400;
  let right = controls.findIndex(([controlX]) => controlX > x);
  if (right < 0) right = controls.length;
  const left = right - 1;
  const [x0, a] = wrappedPoint(left);
  const [x1, b] = wrappedPoint(right);
  const sampleX = x < x0 ? x + 400 : x;
  const t = (sampleX - x0) / (x1 - x0);
  return [0, 1, 2].map((channel) => {
    if (interpolation === "linear") return a[channel] * (1 - t) + b[channel] * t;
    if (interpolation === "cosine") {
      const mixed = (1 - Math.cos(Math.PI * t)) / 2;
      return a[channel] * (1 - mixed) + b[channel] * mixed;
    }
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a[channel]
      + (t3 - 2 * t2 + t) * (x1 - x0) * pchipSlope(left, channel)
      + (-2 * t3 + 3 * t2) * b[channel]
      + (t3 - t2) * (x1 - x0) * pchipSlope(right, channel);
  });
}

function cyclicPosition(re, im) {
  let zr = 0;
  let zi = 0;
  for (let index = 0; index < 50_000; index += 1) {
    const nextRe = zr * zr - zi * zi + re;
    zi = 2 * zr * zi + im;
    zr = nextRe;
    if (zr * zr + zi * zi > 10_000) {
      const smooth = 0.05 * (index + 1 + (
        Math.log(Math.log(128)) - Math.log(Math.log(Math.hypot(zr, zi)))
      ) / Math.log(2));
      const density = 0.42 * smooth;
      const transferred = Math.log1p(density);
      if (!(transferred > 0)) return 0;
      return transferred - Math.floor(transferred);
    }
  }
  return null;
}

const width = 4 / 1.3;
const height = width * (info.height / info.width);
const samples = [];
for (let y = 16; y < info.height; y += 32) {
  for (let x = 16; x < info.width; x += 32) {
    const offset = (y * info.width + x) * info.channels;
    const reference = [data[offset], data[offset + 1], data[offset + 2]];
    if (Math.max(...reference) < 8) continue;
    const re = -0.7 + ((x + 0.5) / info.width - 0.5) * width;
    const im = (0.5 - (y + 0.5) / info.height) * height;
    samples.push({
      reference,
      corrected: cyclicPosition(re, im),
    });
  }
}

const results = [];
const model = { name: "corrected-ln1p-serialized-phase", position: "corrected", phase: 0 };
for (const interpolation of ["linear", "cosine", "pchip"]) {
  let squaredError = 0;
  let compared = 0;
  for (const sample of samples) {
    const t = sample[model.position];
    if (t === null) continue;
    const actual = palette(t * 400 + model.phase, interpolation);
    for (let channel = 0; channel < 3; channel += 1) {
      squaredError += (actual[channel] - sample.reference[channel]) ** 2;
      compared += 1;
    }
  }
  results.push({ model: model.name, interpolation, rmse: Math.sqrt(squaredError / compared) });
}

const curveShape = [];
for (const interpolation of ["linear", "cosine", "pchip"]) {
  let squaredError = 0;
  let compared = 0;
  for (const { reference } of samples) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let position = 0; position < 400; position += 1) {
      const candidate = palette(position, interpolation);
      const error = candidate.reduce(
        (sum, channel, index) => sum + (channel - reference[index]) ** 2,
        0,
      );
      nearest = Math.min(nearest, error);
    }
    squaredError += nearest;
    compared += 3;
  }
  curveShape.push({ interpolation, nearestColorRmse: Math.sqrt(squaredError / compared) });
}

console.log({
  exactUprCamera: results.sort((a, b) => a.rmse - b.rmse),
  curveShape: curveShape.sort((a, b) => a.nearestColorRmse - b.nearestColorRmse),
});
