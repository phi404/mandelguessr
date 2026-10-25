import type { Camera, ComplexCoordinate } from "../fractal/types";
import {
  mandelbrotOverviewBounds,
  questionViewportGeometry,
} from "../fractal/mandelbrot-domain";
import {
  MAX_MAGNIFICATION,
  MIN_MAGNIFICATION,
  isValidMagnification,
  validateQuestionGenerationRules,
  type QuestionGenerationRules,
} from "./game-rules";
import { createGameSeed, createSeededRandom } from "./seed";

export type BoundaryCell = {
  column: number;
  row: number;
  gridSize: number;
};

export type PrototypeQuestion = {
  id: string;
  camera: Camera;
  magnification: number;
  boundaryCell?: BoundaryCell;
  generation?: {
    version: string;
    proposalIndex: number;
    anchor: ComplexCoordinate;
    representative: ComplexCoordinate;
    projectionSteps: number;
    quality: {
      energy: number; threshold: number; metricVersion: string; calibrationVersion: string;
      width: number; height: number; paletteId: import("../fractal/mandelbrot-palettes").MandelbrotPaletteId;
      maxIterations: number; rendererVersion: string; paletteVersion: string;
    };
  };
};

export type BoundaryQuestion = PrototypeQuestion & { boundaryCell: BoundaryCell };

export type ClassifiedPoint = ComplexCoordinate & {
  escaped: boolean;
};

export type BoundaryCellInspection = {
  boundary: boolean;
  inside?: ClassifiedPoint;
  outside?: ClassifiedPoint;
  samples: ClassifiedPoint[];
};

export type CurrentGenerationStats = {
  candidatesTested: number;
  accepted: number;
  rejected: number;
};

export const QUESTION_GENERATOR_VERSION = "distance-guided-visible-v2";
export const BOUNDARY_GENERATOR_VERSION = "uniform-boundary-grid-v1";

const CELL_SAMPLE_SIZE = 5;
const BOUNDARY_SEARCH_STEPS = 40;
export const MAX_CELL_DRAWS = 200_000;

/** Fixed iteration schedule for the historical boundary-grid baseline. */
export function iterationsForMagnification(magnification: number) {
  const logZoom=Math.max(0,Math.log10(magnification));
  return Math.min(5000,Math.max(500,Math.round(500+200*logZoom+140*logZoom**2)));
}

export function escapedWithin(
  re: number,
  im: number,
  maxIterations: number,
) {
  let zr = 0;
  let zi = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextRe = zr * zr - zi * zi + re;
    zi = 2 * zr * zi + im;
    zr = nextRe;
    if (zr * zr + zi * zi > 4) return true;
  }

  return false;
}

export function gridGeometry(gridSize: number) {
  const overview = mandelbrotOverviewBounds();
  return {
    left: overview.left,
    bottom: overview.bottom,
    cellWidth: overview.width / gridSize,
    cellHeight: overview.height / gridSize,
  };
}

export function inspectBoundaryCell(
  column: number,
  row: number,
  gridSize: number,
  maxIterations: number,
): BoundaryCellInspection {
  const geometry = gridGeometry(gridSize);
  const inside: ClassifiedPoint[] = [];
  const outside: ClassifiedPoint[] = [];

  for (let sampleRow = 0; sampleRow < CELL_SAMPLE_SIZE; sampleRow += 1) {
    for (
      let sampleColumn = 0;
      sampleColumn < CELL_SAMPLE_SIZE;
      sampleColumn += 1
    ) {
      const re =
        geometry.left +
        (column + (sampleColumn + 0.5) / CELL_SAMPLE_SIZE) *
          geometry.cellWidth;
      const im =
        geometry.bottom +
        (row + (sampleRow + 0.5) / CELL_SAMPLE_SIZE) *
          geometry.cellHeight;
      const escaped = escapedWithin(re, im, maxIterations);
      const point = { re, im, escaped };
      (escaped ? outside : inside).push(point);
    }
  }

  if (inside.length === 0 || outside.length === 0) {
    return { boundary: false, samples: [...inside, ...outside] };
  }

  let closestInside = inside[0];
  let closestOutside = outside[0];
  let closestSquaredDistance = Number.POSITIVE_INFINITY;

  for (const insidePoint of inside) {
    for (const outsidePoint of outside) {
      const squaredDistance =
        (insidePoint.re - outsidePoint.re) ** 2 +
        (insidePoint.im - outsidePoint.im) ** 2;
      if (squaredDistance < closestSquaredDistance) {
        closestSquaredDistance = squaredDistance;
        closestInside = insidePoint;
        closestOutside = outsidePoint;
      }
    }
  }

  return {
    boundary: true,
    inside: closestInside,
    outside: closestOutside,
    samples: [...inside, ...outside],
  };
}

/** Exposed for deterministic tests and future generator audits. */
export function isDetectedBoundaryCell(cell: BoundaryCell, magnification: number) {
  return inspectBoundaryCell(
    cell.column,
    cell.row,
    cell.gridSize,
    iterationsForMagnification(magnification),
  ).boundary;
}

export function locateBoundary(
  insidePoint: ClassifiedPoint,
  outsidePoint: ClassifiedPoint,
  maxIterations: number,
) {
  let inside = insidePoint;
  let outside = outsidePoint;

  for (let step = 0; step < BOUNDARY_SEARCH_STEPS; step += 1) {
    const midpoint = {
      re: (inside.re + outside.re) / 2,
      im: (inside.im + outside.im) / 2,
    };
    if (escapedWithin(midpoint.re, midpoint.im, maxIterations)) {
      outside = { ...midpoint, escaped: true };
    } else {
      inside = { ...midpoint, escaped: false };
    }
  }

  return {
    re: (inside.re + outside.re) / 2,
    im: (inside.im + outside.im) / 2,
  };
}

/**
 * The legacy boundary-grid baseline draws equal-area cells uniformly, then keeps
 * only cells whose fixed sample lattice contains both escaped and non-escaped
 * points. Rejection sampling makes every detected boundary cell equiprobable.
 */
export function buildRoundQuestions(
  settings: QuestionGenerationRules,
  gameSeed = createGameSeed(),
): BoundaryQuestion[] {
  validateQuestionGenerationRules(settings);

  return buildCurrentQuestionBatch(
    settings.magnification,
    settings.roundCount,
    gameSeed,
    MAX_CELL_DRAWS,
  ).questions;
}

/**
 * The shared boundary-grid baseline. The reference wrapper above retains its
 * original validation and draw limit; Generator Lab can request a larger batch
 * without maintaining a second copy of the algorithm.
 */
export function buildCurrentQuestionBatch(
  magnification: number,
  count: number,
  gameSeed: number,
  maxCellDraws = MAX_CELL_DRAWS,
): { questions: BoundaryQuestion[]; stats: CurrentGenerationStats } {
  if (!isValidMagnification(magnification)) {
    throw new Error(
      `倍率は${MIN_MAGNIFICATION}〜${MAX_MAGNIFICATION}の範囲で指定してください。`,
    );
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("生成数は1以上の整数で指定してください。");
  }

  const gridSize = Math.ceil(magnification);
  const maxIterations = iterationsForMagnification(magnification);
  const viewportWidth = questionViewportGeometry(magnification).width;
  const random = createSeededRandom(gameSeed);
  const selectedCells = new Set<string>();
  const inspectionCache = new Map<string, BoundaryCellInspection>();
  const questions: BoundaryQuestion[] = [];
  let candidatesTested = 0;

  for (
    let draw = 0;
    draw < maxCellDraws && questions.length < count;
    draw += 1
  ) {
    candidatesTested += 1;
    const column = Math.floor(random() * gridSize);
    const row = Math.floor(random() * gridSize);
    const cellKey = `${column}:${row}`;
    if (selectedCells.has(cellKey)) continue;

    let inspection = inspectionCache.get(cellKey);
    if (!inspection) {
      inspection = inspectBoundaryCell(
        column,
        row,
        gridSize,
        maxIterations,
      );
      inspectionCache.set(cellKey, inspection);
    }
    if (!inspection.boundary || !inspection.inside || !inspection.outside) {
      continue;
    }

    selectedCells.add(cellKey);
    const target = locateBoundary(
      inspection.inside,
      inspection.outside,
      maxIterations,
    );
    questions.push({
      id: `${gameSeed}-${gridSize}-${column}-${row}`,
      camera: {
        centerRe: target.re,
        centerIm: target.im,
        viewportWidth,
      },
      magnification,
      boundaryCell: { column, row, gridSize },
    });
  }

  if (questions.length < count) {
    throw new Error(
      "境界セルを十分に抽選できませんでした。もう一度開始してください。",
    );
  }

  return {
    questions,
    stats: {
      candidatesTested,
      accepted: questions.length,
      rejected: candidatesTested - questions.length,
    },
  };
}
