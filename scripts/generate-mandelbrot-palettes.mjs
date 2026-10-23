import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByName.set(process.argv[index], process.argv[index + 1]);
}

const required = ["--fractint", "--scientific", "--colorcet", "--output"];
for (const option of required) {
  if (!argumentsByName.get(option)) {
    throw new Error(`Missing ${option}`);
  }
}

const sourceFiles = {
  fractint: {
    path: argumentsByName.get("--fractint"),
    sha256: "974ab3dcc630f2bc146ca1a70004b3454b720c98b4427fa244db5bd094be1104",
  },
  scientific: {
    path: argumentsByName.get("--scientific"),
    sha256: "3f069d2345af392f401bcff1eafef78c2c8654e5b2d9796a750cdfd81395c8dd",
  },
  colorCetC5: {
    path: resolve(argumentsByName.get("--colorcet"), "CET-C5.csv"),
    sha256: "9438202120d1a79aa9eafbb1fb90606d8b67838bfa8ee9774f5cb8f4e52fa119",
  },
  colorCetC6: {
    path: resolve(argumentsByName.get("--colorcet"), "CET-C6.csv"),
    sha256: "4af0c64ea15a49872d96a4fbb67e838499d5db809fd3aa1b732be6018ff2d03d",
  },
};

async function assertSourceRevision(label, { path, sha256 }) {
  const actual = createHash("sha256").update(await readFile(path)).digest("hex");
  if (actual !== sha256) {
    throw new Error(`${label} source checksum mismatch: expected ${sha256}, found ${actual}`);
  }
}

await Promise.all(Object.entries(sourceFiles).map(([label, source]) =>
  assertSourceRevision(label, source),
));

const CLASSIC_SIZE = 400;
const classicControls = [
  [28, 6555392],
  [92, 13331232],
  [196, 16777197],
  [285, 43775],
  [371, 3146289],
].map(([index, colorRef]) => ({
  index,
  // Ultra Fractal's decimal UPR colours use Windows COLORREF (BGR bytes).
  rgb: [colorRef & 255, (colorRef >>> 8) & 255, (colorRef >>> 16) & 255],
}));

function cyclicPchipChannel(position, channel) {
  const points = classicControls;
  let rightIndex = points.findIndex(({ index }) => index > position);
  if (rightIndex < 0) rightIndex = 0;
  const leftIndex = (rightIndex + points.length - 1) % points.length;
  const left = points[leftIndex];
  const right = points[rightIndex];
  const x0 = left.index;
  const x1 = right.index + (rightIndex === 0 ? CLASSIC_SIZE : 0);
  const x = position < x0 ? position + CLASSIC_SIZE : position;

  const slopeAt = (pointIndex) => {
    const previousIndex = (pointIndex + points.length - 1) % points.length;
    const nextIndex = (pointIndex + 1) % points.length;
    const point = points[pointIndex];
    const previous = points[previousIndex];
    const next = points[nextIndex];
    const previousX = previous.index - (previousIndex > pointIndex ? CLASSIC_SIZE : 0);
    const nextX = next.index + (nextIndex < pointIndex ? CLASSIC_SIZE : 0);
    const beforeWidth = point.index - previousX;
    const afterWidth = nextX - point.index;
    const beforeSlope = (point.rgb[channel] - previous.rgb[channel]) / beforeWidth;
    const afterSlope = (next.rgb[channel] - point.rgb[channel]) / afterWidth;
    if (beforeSlope === 0 || afterSlope === 0 || Math.sign(beforeSlope) !== Math.sign(afterSlope)) {
      return 0;
    }
    const firstWeight = 2 * afterWidth + beforeWidth;
    const secondWeight = afterWidth + 2 * beforeWidth;
    return (firstWeight + secondWeight) /
      (firstWeight / beforeSlope + secondWeight / afterSlope);
  };

  const width = x1 - x0;
  const t = (x - x0) / width;
  const t2 = t * t;
  const t3 = t2 * t;
  const value =
    (2 * t3 - 3 * t2 + 1) * left.rgb[channel] +
    (t3 - 2 * t2 + t) * width * slopeAt(leftIndex) +
    (-2 * t3 + 3 * t2) * right.rgb[channel] +
    (t3 - t2) * width * slopeAt(rightIndex);
  return Math.max(0, Math.min(255, Math.round(value)));
}

function buildClassic() {
  const values = [];
  for (let source = 0; source < CLASSIC_SIZE; source += 1) {
    // The UPR's serialized control-point indices already describe the phase
    // visible in Wolfgang Beyer's exported image. Its separate rotation=29 is
    // editor state and must not be applied a second time to the canonical LUT.
    for (let channel = 0; channel < 3; channel += 1) {
      values.push(cyclicPchipChannel(source, channel));
    }
  }
  return values;
}

async function parseFractint(path) {
  const rows = (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)/))
    .filter(Boolean)
    .map((match) => match.slice(1, 4).map(Number));
  if (rows.length < 56) throw new Error("Fractint default.map is incomplete");
  return rows.slice(32, 56).flat();
}

async function parseScientific(path) {
  const source = await readFile(path, "utf8");
  const match = source.match(/romaO=reshape\(\s*\[\s*&([\s\S]*?)\],\s*shape\(romaO\)/);
  if (!match) throw new Error("romaO v8.0.1 table was not found");
  const values = [...match[1].matchAll(/\d+/g)].map(([value]) => Number(value));
  if (values.length !== 256 * 3) throw new Error(`Expected 768 romaO bytes, found ${values.length}`);
  return values;
}

async function parseColorCet(directory, name) {
  const source = await readFile(resolve(directory, `${name}.csv`), "utf8");
  const values = source.trim().split(/\r?\n/).flatMap((line) => line.split(",").map(Number));
  if (values.length !== 256 * 3 || values.some((value) => !Number.isInteger(value))) {
    throw new Error(`${name} is not a 256-entry integer RGB table`);
  }
  return values;
}

function formatArray(name, values) {
  const lines = [];
  for (let index = 0; index < values.length; index += 24) {
    lines.push(`  ${values.slice(index, index + 24).join(", ")},`);
  }
  return `export const ${name} = new Uint8Array([\n${lines.join("\n")}\n]);`;
}

const palettes = {
  CLASSIC_V2_LUT: buildClassic(),
  RETRO_V1_LUT: await parseFractint(sourceFiles.fractint.path),
  SCIENTIFIC_ROMAO_8_0_1_LUT: await parseScientific(sourceFiles.scientific.path),
  MONOCHROME_CET_C5_LUT: await parseColorCet(argumentsByName.get("--colorcet"), "CET-C5"),
  SPECTRUM_CET_C6_LUT: await parseColorCet(argumentsByName.get("--colorcet"), "CET-C6"),
};

const hashes = Object.fromEntries(Object.entries(palettes).map(([name, values]) => [
  name,
  createHash("sha256").update(Uint8Array.from(values)).digest("hex"),
]));
const generated = `// Generated by scripts/generate-mandelbrot-palettes.mjs. Do not hand-edit.\n` +
  `${Object.entries(palettes).map(([name, values]) => formatArray(name, values)).join("\n\n")}\n\n` +
  `export const MANDELBROT_PALETTE_SHA256 = ${JSON.stringify(hashes, null, 2)} as const;\n`;
await writeFile(argumentsByName.get("--output"), generated, "utf8");
