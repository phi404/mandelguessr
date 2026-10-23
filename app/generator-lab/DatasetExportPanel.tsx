"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  createMandelbrotDatasetManifest,
  generateMandelbrotDatasetSamples,
  isMandelbrotDatasetCancellation,
  type MandelbrotDatasetProgress,
  type MandelbrotDatasetRenderConfig,
} from "../fractal/mandelbrot-dataset";
import {
  pickMandelbrotDatasetDirectory,
  saveMandelbrotDatasetToDirectory,
  supportsMandelbrotDatasetDirectoryPicker,
} from "../fractal/mandelbrot-dataset-filesystem";
import { MANDELBROT_MAX_ITERATIONS } from "../fractal/mandelbrot-domain";
import { validateMandelbrotRenderParams } from "../fractal/mandelbrot-render";
import {
  MANDELBROT_PALETTE_IDS,
  MANDELBROT_PALETTES,
  type MandelbrotPaletteId,
} from "../fractal/mandelbrot-palettes";
import { labQuestionsToDatasetPoints, generatorLabDatasetSource } from "./dataset-points";
import { generateLabQuestionsAsync } from "./generator-lab-client";
import {
  MAX_LAB_COUNT,
  type GeneratorAlgorithm,
} from "./generator-lab";

const DEFAULT_DATASET_COUNT = 100;
const DEFAULT_DATASET_SIZE = 512;
const subscribeToDirectoryPickerSupport = () => () => {};

function directoryPickerSupportSnapshot() {
  return supportsMandelbrotDatasetDirectoryPicker()
    ? "supported"
    : "unsupported";
}

function directoryPickerServerSnapshot() {
  return "unknown" as const;
}

type DatasetExportPanelProps = {
  algorithm: GeneratorAlgorithm;
  magnification: number;
  seed: number;
  boundaryResolution: number;
};

export function DatasetExportPanel({
  algorithm,
  magnification,
  seed,
  boundaryResolution,
}: DatasetExportPanelProps) {
  const [count, setCount] = useState(DEFAULT_DATASET_COUNT);
  const [width, setWidth] = useState(DEFAULT_DATASET_SIZE);
  const [height, setHeight] = useState(DEFAULT_DATASET_SIZE);
  const [paletteId, setPaletteId] = useState<MandelbrotPaletteId>("classic");
  const [maxIterations, setMaxIterations] = useState(MANDELBROT_MAX_ITERATIONS);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MandelbrotDatasetProgress | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pickerSupport = useSyncExternalStore(
    subscribeToDirectoryPickerSupport,
    directoryPickerSupportSnapshot,
    directoryPickerServerSnapshot,
  );
  const pickerSupported = pickerSupport === "supported";

  const selectFolder = async () => {
    setStatus(null);
    try {
      setDirectory(await pickMandelbrotDatasetDirectory());
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setStatus("Folder selection cancelled.");
      } else {
        setStatus(
          cause instanceof Error ? cause.message : "保存先を選択できませんでした。",
        );
      }
    }
  };

  const generateDataset = async () => {
    if (!directory) {
      setStatus("先に空の保存先フォルダを選択してください。");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_LAB_COUNT) {
      setStatus(`Countは1〜${MAX_LAB_COUNT}の整数で指定してください。`);
      return;
    }

    const renderConfig: MandelbrotDatasetRenderConfig = {
      width,
      height,
      paletteId,
      maxIterations,
    };
    try {
      validateMandelbrotRenderParams({
        centerRe: 0,
        centerIm: 0,
        zoom: magnification,
        ...renderConfig,
      });
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "描画設定が不正です。");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunning(true);
    setProgress({ completed: 0, total: count, currentId: "—" });
    setStatus("Sampling points in Generator Lab worker…");

    try {
      const generatorSettings = {
        algorithm,
        magnification,
        seed,
        count,
        boundaryResolution,
        paletteId,
      };
      const result = await generateLabQuestionsAsync(
        generatorSettings,
        controller.signal,
      );
      const points = labQuestionsToDatasetPoints(result.questions);
      const manifest = createMandelbrotDatasetManifest(
        points,
        renderConfig,
        generatorLabDatasetSource(generatorSettings, result.questions),
      );
      const samples = generateMandelbrotDatasetSamples(points, renderConfig, {
        signal: controller.signal,
      });
      setStatus("Rendering and saving PNG files…");
      await saveMandelbrotDatasetToDirectory(directory, manifest, samples, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setStatus(
        `Dataset ready · ${manifest.count} samples · ${manifest.width}×${manifest.height} · ${directory.name}`,
      );
    } catch (cause) {
      setStatus(
        isMandelbrotDatasetCancellation(cause) ||
            (cause instanceof DOMException && cause.name === "AbortError")
          ? "Dataset generation cancelled. Partial files were removed."
          : cause instanceof Error
            ? cause.message
            : "Datasetを生成できませんでした。",
      );
    } finally {
      abortControllerRef.current = null;
      setRunning(false);
    }
  };

  return (
    <section className="lab-dataset-panel" aria-labelledby="dataset-export-title">
      <div className="lab-section-heading">
        <div><span>ML</span><h2 id="dataset-export-title">DATASET EXPORT</h2></div>
        <p>Generator sampling → shared WebGL pipeline → PNG + JSONL</p>
      </div>
      <div className="lab-dataset-grid">
        <DatasetNumberField label="COUNT" value={count} min={1} max={MAX_LAB_COUNT} onChange={setCount} disabled={running} />
        <DatasetNumberField label="WIDTH" value={width} min={1} max={4096} onChange={setWidth} disabled={running} />
        <DatasetNumberField label="HEIGHT" value={height} min={1} max={4096} onChange={setHeight} disabled={running} />
        <label>
          <span>PALETTE</span>
          <select value={paletteId} disabled={running} onChange={(event) => setPaletteId(event.currentTarget.value as MandelbrotPaletteId)}>
            {MANDELBROT_PALETTE_IDS.map((id) => (
              <option key={id} value={id}>{MANDELBROT_PALETTES[id].label.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <DatasetNumberField label="ITERATIONS" value={maxIterations} min={1} max={MANDELBROT_MAX_ITERATIONS} onChange={setMaxIterations} disabled={running} />
      </div>
      <div className="lab-dataset-actions">
        <button type="button" onClick={selectFolder} disabled={running || !pickerSupported}>
          SELECT FOLDER
        </button>
        <code>{directory?.name ?? "no folder selected"}</code>
        <button type="button" className="is-primary" onClick={generateDataset} disabled={running || !directory || !pickerSupported}>
          GENERATE DATASET
        </button>
        {running && (
          <button type="button" className="cancel" onClick={() => abortControllerRef.current?.abort()}>
            CANCEL
          </button>
        )}
      </div>
      {progress && (
        <div className="lab-dataset-progress">
          <progress value={progress.completed} max={progress.total} />
          <span>{progress.completed} / {progress.total}</span>
          <code>{progress.currentId}</code>
        </div>
      )}
      {pickerSupport === "unsupported" && (
        <p className="lab-error" role="alert">
          File System Access API is unavailable. Use a Chromium-based browser; ZIP fallback is not included in this MVP.
        </p>
      )}
      {status && <p className="lab-dataset-status" aria-live="polite">{status}</p>}
      <p className="lab-rule-note">
        Uses the current algorithm, magnification, seed, and boundary resolution. Select an empty folder; existing dataset.json, metadata.jsonl, or images/ are never overwritten.
      </p>
    </section>
  );
}

function DatasetNumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step="1"
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
