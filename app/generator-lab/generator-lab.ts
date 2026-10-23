import type {
  Camera,
  ComplexCoordinate,
} from "../fractal/types";
import {
  mandelbrotOverviewBounds,
  questionViewportGeometry,
} from "../fractal/mandelbrot-domain";
import {
  buildCurrentQuestionBatch,
  gridGeometry,
  inspectBoundaryCell,
  iterationsForMagnification,
  locateBoundary,
  MAX_CELL_DRAWS,
  type ClassifiedPoint,
  type PrototypeQuestion,
} from "../game/question-generator";
import {
  isValidMagnification,
  MAX_MAGNIFICATION,
  MIN_MAGNIFICATION,
} from "../game/game-rules";
import { createSeededRandom } from "../game/seed";

export const LAB_COUNT_OPTIONS = [10, 50, 100, 500] as const;
export const MAX_LAB_COUNT = 1000;
export const BOUNDARY_RESOLUTION_OPTIONS = [2, 4, 8] as const;
export const DEFAULT_BOUNDARY_RESOLUTION = 4;

const VALID_BASE_COLUMNS = 8;
const VALID_BASE_ROWS = 5;
const VALID_ADAPTIVE_DEPTH = 2;
const ELEMENT_SAMPLE_SIZE = 3;
const MAX_LAB_CANDIDATES = 5_000_000;

export type GeneratorAlgorithm =
  | "current"
  | "uniform-valid-viewport"
  | "boundary-element-offset"
  | "distance-visible";

export type LabGeneratorSettings = {
  algorithm: GeneratorAlgorithm;
  magnification: number;
  seed: number;
  count: number;
  boundaryResolution: number;
  paletteId?: import("../fractal/mandelbrot-palettes").MandelbrotPaletteId;
};

export type MandelbrotProbe = ComplexCoordinate & {
  escaped: boolean;
  escapeIteration: number | null;
  distanceEstimate: number | null;
};

type Rect = {
  left: number;
  right: number;
  bottom: number;
  top: number;
};

export type CurrentDebug = {
  kind: "current";
  cell: Rect & { column: number; row: number; gridSize: number };
  samples: ClassifiedPoint[];
  selectedPair: { inside: ClassifiedPoint; outside: ClassifiedPoint };
  target: ComplexCoordinate;
};

export type ValidViewportDebug = {
  kind: "uniform-valid-viewport";
  viewport: Rect;
  probes: MandelbrotProbe[];
  acceptance: "classification-crossing" | "distance-estimate";
  baseGrid: { columns: number; rows: number; adaptiveDepth: number };
};

export type BoundaryElementDebug = {
  kind: "boundary-element-offset";
  element: Rect & { column: number; row: number; gridSize: number };
  probes: MandelbrotProbe[];
  representative: ComplexCoordinate;
  detection: "classification-crossing" | "distance-estimate";
  viewportOffset: ComplexCoordinate;
  domainRejectedBeforeAcceptance: number;
};

export type VisibleSceneDebug = {
  kind: "distance-visible";
  viewport: Rect;
  generation: NonNullable<PrototypeQuestion["generation"]>;
};

export type LabQuestion = {
  id: string;
  index: number;
  camera: Camera;
  magnification: number;
  algorithm: GeneratorAlgorithm;
  seed: number;
  debug: CurrentDebug | ValidViewportDebug | BoundaryElementDebug | VisibleSceneDebug;
};

export type LabGenerationStats = {
  generated: number;
  candidatesTested: number;
  accepted: number;
  rejected: number;
  generationTimeMs: number;
  detail: string;
  scene?: {
    projectionRejected: number;
    qualityRejected: number;
    threshold: number;
    calibration: import("../game/scene-quality").CalibrationMeasurement[];
  };
};

export type LabGenerationResult = {
  settings: LabGeneratorSettings;
  questions: LabQuestion[];
  stats: LabGenerationStats;
};

type CellAssessment = {
  valid: boolean;
  acceptance?: ValidViewportDebug["acceptance"];
  probes: MandelbrotProbe[];
};

export function validateLabSettings(settings: LabGeneratorSettings) {
  if (
    !Number.isInteger(settings.seed) ||
    settings.seed < 0 ||
    settings.seed > 0xffffffff
  ) {
    throw new Error("Seedは0〜4294967295の整数で指定してください。");
  }
  if (!isValidMagnification(settings.magnification)) {
    throw new Error(
      `倍率は${MIN_MAGNIFICATION}〜${MAX_MAGNIFICATION}の範囲で指定してください。`,
    );
  }
  if (
    !Number.isInteger(settings.count) ||
    settings.count < 1 ||
    settings.count > MAX_LAB_COUNT
  ) {
    throw new Error(`生成数は1〜${MAX_LAB_COUNT}の整数で指定してください。`);
  }
  if (
    !Number.isInteger(settings.boundaryResolution) ||
    !BOUNDARY_RESOLUTION_OPTIONS.includes(
      settings.boundaryResolution as (typeof BOUNDARY_RESOLUTION_OPTIONS)[number],
    )
  ) {
    throw new Error("Boundary resolutionは2、4、8のいずれかです。");
  }
}

/** Escape classification plus the standard exterior distance estimate. */
export function probeMandelbrot(
  re: number,
  im: number,
  maxIterations: number,
): MandelbrotProbe {
  // These two analytic interiors save most work without changing membership.
  const bulbRe = re + 1;
  if (bulbRe * bulbRe + im * im <= 1 / 16) {
    return { re, im, escaped: false, escapeIteration: null, distanceEstimate: null };
  }
  const cardioidRe = re - 0.25;
  const q = cardioidRe * cardioidRe + im * im;
  if (q * (q + cardioidRe) <= 0.25 * im * im) {
    return { re, im, escaped: false, escapeIteration: null, distanceEstimate: null };
  }

  let zr = 0;
  let zi = 0;
  let derivativeRe = 0;
  let derivativeIm = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const nextDerivativeRe =
      2 * (zr * derivativeRe - zi * derivativeIm) + 1;
    const nextDerivativeIm = 2 * (zr * derivativeIm + zi * derivativeRe);
    const nextRe = zr * zr - zi * zi + re;
    const nextIm = 2 * zr * zi + im;
    zr = nextRe;
    zi = nextIm;
    derivativeRe = nextDerivativeRe;
    derivativeIm = nextDerivativeIm;

    const magnitudeSquared = zr * zr + zi * zi;
    if (magnitudeSquared > 4) {
      const escapeIteration = iteration;
      let estimateMagnitudeSquared = magnitudeSquared;
      // Membership is already certain after radius 2. Continue only to the
      // renderer's radius 16 so the exterior distance estimate is evaluated
      // in a numerically more stable part of the escaping orbit.
      for (
        let continuation = 0;
        continuation < 32 &&
        estimateMagnitudeSquared <= 256 &&
        Number.isFinite(estimateMagnitudeSquared);
        continuation += 1
      ) {
        const nextDerivativeRe =
          2 * (zr * derivativeRe - zi * derivativeIm) + 1;
        const nextDerivativeIm = 2 * (zr * derivativeIm + zi * derivativeRe);
        const nextRe = zr * zr - zi * zi + re;
        const nextIm = 2 * zr * zi + im;
        zr = nextRe;
        zi = nextIm;
        derivativeRe = nextDerivativeRe;
        derivativeIm = nextDerivativeIm;
        estimateMagnitudeSquared = zr * zr + zi * zi;
      }
      const magnitude = Math.sqrt(estimateMagnitudeSquared);
      const derivativeMagnitude = Math.hypot(derivativeRe, derivativeIm);
      const estimate =
        derivativeMagnitude > 0 && Number.isFinite(derivativeMagnitude)
          ? (magnitude * Math.log(magnitude)) / derivativeMagnitude
          : null;
      return {
        re,
        im,
        escaped: true,
        escapeIteration,
        distanceEstimate:
          estimate !== null && Number.isFinite(estimate)
            ? Math.max(0, estimate)
            : null,
      };
    }
  }

  return { re, im, escaped: false, escapeIteration: null, distanceEstimate: null };
}

function assessValidViewport(
  center: ComplexCoordinate,
  magnification: number,
  maxIterations: number,
): CellAssessment {
  const viewport = questionViewportGeometry(magnification);
  const fullRect: Rect = {
    left: center.re - viewport.width / 2,
    right: center.re + viewport.width / 2,
    bottom: center.im - viewport.height / 2,
    top: center.im + viewport.height / 2,
  };
  const probes: MandelbrotProbe[] = [];
  let sawEscaped = false;
  let sawNonEscaped = false;

  const probe = (re: number, im: number) => {
    const result = probeMandelbrot(re, im, maxIterations);
    probes.push(result);
    sawEscaped ||= result.escaped;
    sawNonEscaped ||= !result.escaped;
    return result;
  };

  // Corners catch viewports spanning a broad inside/outside transition.
  probe(fullRect.left, fullRect.bottom);
  probe(fullRect.left, fullRect.top);
  probe(fullRect.right, fullRect.bottom);
  probe(fullRect.right, fullRect.top);
  if (sawEscaped && sawNonEscaped) {
    return { valid: true, acceptance: "classification-crossing", probes };
  }

  const assessCell = (rect: Rect, depth: number): boolean => {
    const width = rect.right - rect.left;
    const height = rect.top - rect.bottom;
    const centerProbe = probe(
      (rect.left + rect.right) / 2,
      (rect.bottom + rect.top) / 2,
    );
    if (sawEscaped && sawNonEscaped) return true;
    if (!centerProbe.escaped || centerProbe.distanceEstimate === null) {
      return false;
    }

    // The circle of this radius is wholly inside the tile. With an exact
    // distance, a hit therefore witnesses a set/boundary point in the viewport.
    if (centerProbe.distanceEstimate <= Math.min(width, height) / 2) {
      return true;
    }
    if (
      depth >= VALID_ADAPTIVE_DEPTH ||
      centerProbe.distanceEstimate > Math.hypot(width, height) / 2
    ) {
      return false;
    }

    const middleRe = (rect.left + rect.right) / 2;
    const middleIm = (rect.bottom + rect.top) / 2;
    return (
      assessCell(
        { left: rect.left, right: middleRe, bottom: rect.bottom, top: middleIm },
        depth + 1,
      ) ||
      assessCell(
        { left: middleRe, right: rect.right, bottom: rect.bottom, top: middleIm },
        depth + 1,
      ) ||
      assessCell(
        { left: rect.left, right: middleRe, bottom: middleIm, top: rect.top },
        depth + 1,
      ) ||
      assessCell(
        { left: middleRe, right: rect.right, bottom: middleIm, top: rect.top },
        depth + 1,
      )
    );
  };

  const cellWidth = viewport.width / VALID_BASE_COLUMNS;
  const cellHeight = viewport.height / VALID_BASE_ROWS;
  for (let row = 0; row < VALID_BASE_ROWS; row += 1) {
    for (let column = 0; column < VALID_BASE_COLUMNS; column += 1) {
      const rect = {
        left: fullRect.left + column * cellWidth,
        right: fullRect.left + (column + 1) * cellWidth,
        bottom: fullRect.bottom + row * cellHeight,
        top: fullRect.bottom + (row + 1) * cellHeight,
      };
      if (assessCell(rect, 0)) {
        return {
          valid: true,
          acceptance:
            sawEscaped && sawNonEscaped
              ? "classification-crossing"
              : "distance-estimate",
          probes,
        };
      }
    }
  }

  return { valid: false, probes };
}

function inspectBoundaryElement(
  column: number,
  row: number,
  gridSize: number,
  maxIterations: number,
) {
  const geometry = gridGeometry(gridSize);
  const left = geometry.left + column * geometry.cellWidth;
  const bottom = geometry.bottom + row * geometry.cellHeight;
  const probes: MandelbrotProbe[] = [];
  const inside: ClassifiedPoint[] = [];
  const outside: ClassifiedPoint[] = [];

  for (let sampleRow = 0; sampleRow < ELEMENT_SAMPLE_SIZE; sampleRow += 1) {
    for (
      let sampleColumn = 0;
      sampleColumn < ELEMENT_SAMPLE_SIZE;
      sampleColumn += 1
    ) {
      const re =
        left +
        ((sampleColumn + 0.5) / ELEMENT_SAMPLE_SIZE) * geometry.cellWidth;
      const im =
        bottom +
        ((sampleRow + 0.5) / ELEMENT_SAMPLE_SIZE) * geometry.cellHeight;
      const result = probeMandelbrot(re, im, maxIterations);
      probes.push(result);
      (result.escaped ? outside : inside).push({
        re: result.re,
        im: result.im,
        escaped: result.escaped,
      });
    }
  }

  if (inside.length > 0 && outside.length > 0) {
    let closestInside = inside[0];
    let closestOutside = outside[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const insidePoint of inside) {
      for (const outsidePoint of outside) {
        const distance =
          (insidePoint.re - outsidePoint.re) ** 2 +
          (insidePoint.im - outsidePoint.im) ** 2;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestInside = insidePoint;
          closestOutside = outsidePoint;
        }
      }
    }
    return {
      accepted: true as const,
      detection: "classification-crossing" as const,
      representative: locateBoundary(
        closestInside,
        closestOutside,
        maxIterations,
      ),
      probes,
      rect: {
        left,
        right: left + geometry.cellWidth,
        bottom,
        top: bottom + geometry.cellHeight,
      },
    };
  }

  const centerProbe = probes[Math.floor(probes.length / 2)];
  if (
    centerProbe.escaped &&
    centerProbe.distanceEstimate !== null &&
    centerProbe.distanceEstimate <=
      Math.min(geometry.cellWidth, geometry.cellHeight) / 2
  ) {
    return {
      accepted: true as const,
      detection: "distance-estimate" as const,
      representative: { re: centerProbe.re, im: centerProbe.im },
      probes,
      rect: {
        left,
        right: left + geometry.cellWidth,
        bottom,
        top: bottom + geometry.cellHeight,
      },
    };
  }

  return { accepted: false as const };
}

function generateCurrent(settings: LabGeneratorSettings): LabGenerationResult {
  const startedAt = performance.now();
  const batch = buildCurrentQuestionBatch(
    settings.magnification,
    settings.count,
    settings.seed,
    Math.min(
      MAX_LAB_CANDIDATES,
      Math.max(MAX_CELL_DRAWS, settings.count * 10_000),
    ),
  );
  const maxIterations = iterationsForMagnification(settings.magnification);
  const questions = batch.questions.map<LabQuestion>((question, index) => {
    const inspection = inspectBoundaryCell(
      question.boundaryCell.column,
      question.boundaryCell.row,
      question.boundaryCell.gridSize,
      maxIterations,
    );
    if (!inspection.inside || !inspection.outside) {
      throw new Error("CURRENTの境界セル診断を再構成できませんでした。");
    }
    const geometry = gridGeometry(question.boundaryCell.gridSize);
    const left =
      geometry.left + question.boundaryCell.column * geometry.cellWidth;
    const bottom =
      geometry.bottom + question.boundaryCell.row * geometry.cellHeight;
    return {
      ...question,
      index,
      algorithm: "current",
      seed: settings.seed,
      debug: {
        kind: "current",
        cell: {
          left,
          right: left + geometry.cellWidth,
          bottom,
          top: bottom + geometry.cellHeight,
          ...question.boundaryCell,
        },
        samples: inspection.samples,
        selectedPair: {
          inside: inspection.inside,
          outside: inspection.outside,
        },
        target: {
          re: question.camera.centerRe,
          im: question.camera.centerIm,
        },
      },
    };
  });

  return {
    settings,
    questions,
    stats: {
      generated: questions.length,
      candidatesTested: batch.stats.candidatesTested,
      accepted: batch.stats.accepted,
      rejected: batch.stats.rejected,
      generationTimeMs: performance.now() - startedAt,
      detail: "random cell draws (duplicate/undetected cells are rejected)",
    },
  };
}

function generateUniformValid(
  settings: LabGeneratorSettings,
): LabGenerationResult {
  const startedAt = performance.now();
  const random = createSeededRandom(settings.seed);
  const overview = mandelbrotOverviewBounds();
  const viewport = questionViewportGeometry(settings.magnification);
  const maxIterations = iterationsForMagnification(settings.magnification);
  const maxCandidates = Math.min(
    MAX_LAB_CANDIDATES,
    Math.max(100_000, settings.count * 10_000),
  );
  const questions: LabQuestion[] = [];
  let candidatesTested = 0;

  while (
    questions.length < settings.count &&
    candidatesTested < maxCandidates
  ) {
    candidatesTested += 1;
    const center = {
      re: overview.left + random() * overview.width,
      im: overview.bottom + random() * overview.height,
    };
    const assessment = assessValidViewport(
      center,
      settings.magnification,
      maxIterations,
    );
    if (!assessment.valid || !assessment.acceptance) continue;

    const index = questions.length;
    questions.push({
      id: `${settings.seed}-valid-${settings.magnification}-${index}`,
      index,
      camera: {
        centerRe: center.re,
        centerIm: center.im,
        viewportWidth: viewport.width,
      },
      magnification: settings.magnification,
      algorithm: "uniform-valid-viewport",
      seed: settings.seed,
      debug: {
        kind: "uniform-valid-viewport",
        viewport: {
          left: center.re - viewport.width / 2,
          right: center.re + viewport.width / 2,
          bottom: center.im - viewport.height / 2,
          top: center.im + viewport.height / 2,
        },
        probes: assessment.probes,
        acceptance: assessment.acceptance,
        baseGrid: {
          columns: VALID_BASE_COLUMNS,
          rows: VALID_BASE_ROWS,
          adaptiveDepth: VALID_ADAPTIVE_DEPTH,
        },
      },
    });
  }

  if (questions.length < settings.count) {
    throw new Error(
      `VALID VIEWPORT近似は${maxCandidates.toLocaleString()}候補以内に${settings.count}問を生成できませんでした。`,
    );
  }

  return {
    settings,
    questions,
    stats: {
      generated: questions.length,
      candidatesTested,
      accepted: questions.length,
      rejected: candidatesTested - questions.length,
      generationTimeMs: performance.now() - startedAt,
      detail: "uniform camera centers tested by the finite validity approximation",
    },
  };
}

function generateBoundaryElement(
  settings: LabGeneratorSettings,
): LabGenerationResult {
  const startedAt = performance.now();
  const random = createSeededRandom(settings.seed);
  const overview = mandelbrotOverviewBounds();
  const viewport = questionViewportGeometry(settings.magnification);
  const maxIterations = iterationsForMagnification(settings.magnification);
  const gridSize = Math.ceil(
    settings.magnification * settings.boundaryResolution,
  );
  const maxCandidates = Math.min(
    MAX_LAB_CANDIDATES,
    Math.max(100_000, settings.count * 10_000),
  );
  const questions: LabQuestion[] = [];
  let candidatesTested = 0;
  let domainRejectedBeforeAcceptance = 0;

  while (
    questions.length < settings.count &&
    candidatesTested < maxCandidates
  ) {
    candidatesTested += 1;
    const column = Math.floor(random() * gridSize);
    const row = Math.floor(random() * gridSize);
    const element = inspectBoundaryElement(
      column,
      row,
      gridSize,
      maxIterations,
    );
    if (!element.accepted) continue;

    const viewportOffset = {
      re: (random() - 0.5) * viewport.width,
      im: (random() - 0.5) * viewport.height,
    };
    const center = {
      re: element.representative.re - viewportOffset.re,
      im: element.representative.im - viewportOffset.im,
    };
    // The shared center domain is the overview rectangle. Never clip offsets.
    if (
      center.re < overview.left ||
      center.re > overview.right ||
      center.im < overview.bottom ||
      center.im > overview.top
    ) {
      domainRejectedBeforeAcceptance += 1;
      continue;
    }

    const index = questions.length;
    questions.push({
      id: `${settings.seed}-element-${gridSize}-${column}-${row}-${index}`,
      index,
      camera: {
        centerRe: center.re,
        centerIm: center.im,
        viewportWidth: viewport.width,
      },
      magnification: settings.magnification,
      algorithm: "boundary-element-offset",
      seed: settings.seed,
      debug: {
        kind: "boundary-element-offset",
        element: { ...element.rect, column, row, gridSize },
        probes: element.probes,
        representative: element.representative,
        detection: element.detection,
        viewportOffset,
        domainRejectedBeforeAcceptance,
      },
    });
  }

  if (questions.length < settings.count) {
    throw new Error(
      `BOUNDARY ELEMENTは${maxCandidates.toLocaleString()}候補以内に${settings.count}問を生成できませんでした。`,
    );
  }

  return {
    settings,
    questions,
    stats: {
      generated: questions.length,
      candidatesTested,
      accepted: questions.length,
      rejected: candidatesTested - questions.length,
      generationTimeMs: performance.now() - startedAt,
      detail: `${domainRejectedBeforeAcceptance} detected element/offset pairs rejected by center domain`,
    },
  };
}

export function generateLabQuestions(
  settings: LabGeneratorSettings,
): LabGenerationResult {
  validateLabSettings(settings);
  const normalized = { ...settings, seed: settings.seed >>> 0 };
  switch (normalized.algorithm) {
    case "distance-visible":
      throw new Error("DISTANCE VISIBLEは画像判定を伴う非同期生成を使用してください。");
    case "current":
      return generateCurrent(normalized);
    case "uniform-valid-viewport":
      return generateUniformValid(normalized);
    case "boundary-element-offset":
      return generateBoundaryElement(normalized);
  }
}
