import {
  isMandelbrotDatasetCancellation,
  type GeneratedMandelbrotDatasetSample,
  type MandelbrotDatasetManifest,
  type MandelbrotDatasetProgress,
} from "./mandelbrot-dataset";

export type MandelbrotDatasetSaveOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: MandelbrotDatasetProgress) => void;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

export function supportsMandelbrotDatasetDirectoryPicker() {
  return typeof window !== "undefined" &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function pickMandelbrotDatasetDirectory() {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      "このブラウザはFile System Access APIに対応していません。Chromium系ブラウザで開いてください。",
    );
  }
  return picker({ id: "mandelguessr-dataset", mode: "readwrite" });
}

/**
 * Saves a pre-generated sample stream. The selected directory must not already
 * contain dataset.json, metadata.jsonl, or images/. On failure or cancellation,
 * only artifacts created by this call are removed.
 */
export async function saveMandelbrotDatasetToDirectory(
  directory: FileSystemDirectoryHandle,
  manifest: MandelbrotDatasetManifest,
  samples: AsyncIterable<GeneratedMandelbrotDatasetSample>,
  options: MandelbrotDatasetSaveOptions = {},
) {
  await assertEmptyDatasetTarget(directory);
  const metadataLines: string[] = [];
  const ids = new Set<string>();
  let imagesDirectory: FileSystemDirectoryHandle | null = null;
  let completed = 0;

  try {
    throwIfCancelled(options.signal);
    imagesDirectory = await directory.getDirectoryHandle("images", {
      create: true,
    });

    for await (const sample of samples) {
      throwIfCancelled(options.signal);
      validateSampleAgainstManifest(sample, manifest, ids);
      const imageHandle = await imagesDirectory.getFileHandle(
        `${sample.metadata.id}.png`,
        { create: true },
      );
      try {
        await writeFile(imageHandle, sample.png);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `sample ${sample.metadata.id} のPNG保存に失敗しました: ${detail}`,
          { cause },
        );
      }
      metadataLines.push(JSON.stringify(sample.metadata));
      ids.add(sample.metadata.id);
      completed += 1;
      options.onProgress?.({
        completed,
        total: manifest.count,
        currentId: sample.metadata.id,
      });
    }

    if (completed !== manifest.count) {
      throw new Error(
        `生成sample数 ${completed} がdataset count ${manifest.count} と一致しません。`,
      );
    }

    throwIfCancelled(options.signal);
    const metadataHandle = await directory.getFileHandle("metadata.jsonl", {
      create: true,
    });
    await writeFile(metadataHandle, `${metadataLines.join("\n")}\n`);
    const manifestHandle = await directory.getFileHandle("dataset.json", {
      create: true,
    });
    await writeFile(manifestHandle, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (cause) {
    await cleanupPartialDataset(directory);
    if (isMandelbrotDatasetCancellation(cause)) throw cause;
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Datasetの保存に失敗しました: ${detail}`);
  }
}

async function assertEmptyDatasetTarget(directory: FileSystemDirectoryHandle) {
  const conflicts = (
    await Promise.all([
      entryExists(directory, "dataset.json", "file"),
      entryExists(directory, "metadata.jsonl", "file"),
      entryExists(directory, "images", "directory"),
    ])
  ).filter((entry): entry is string => entry !== null);

  if (conflicts.length > 0) {
    throw new Error(
      `選択先には既存の${conflicts.join("、")}があります。空の保存先を選択してください。`,
    );
  }
}

async function entryExists(
  directory: FileSystemDirectoryHandle,
  name: string,
  kind: "file" | "directory",
) {
  try {
    if (kind === "file") await directory.getFileHandle(name);
    else await directory.getDirectoryHandle(name);
    return name;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "NotFoundError") {
      return null;
    }
    throw cause;
  }
}

function validateSampleAgainstManifest(
  sample: GeneratedMandelbrotDatasetSample,
  manifest: MandelbrotDatasetManifest,
  ids: ReadonlySet<string>,
) {
  const { metadata, png } = sample;
  if (ids.has(metadata.id)) {
    throw new Error(`sample id ${metadata.id} が重複しています。`);
  }
  if (png.type !== "image/png") {
    throw new Error(`sample ${metadata.id} のBlob typeがimage/pngではありません。`);
  }
  for (const key of ["width", "height", "paletteId", "maxIterations"] as const) {
    if (metadata[key] !== manifest[key]) {
      throw new Error(`sample ${metadata.id} の${key}がdataset.jsonと一致しません。`);
    }
  }
  if (
    metadata.rendererVersion !== manifest.rendererVersion ||
    metadata.paletteVersion !== manifest.paletteVersion
  ) {
    throw new Error(`sample ${metadata.id} のrenderer/palette versionが一致しません。`);
  }
}

async function writeFile(handle: FileSystemFileHandle, data: Blob | string) {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (cause) {
    try {
      await writable.abort(cause);
    } catch {
      // Preserve the original write failure.
    }
    throw cause;
  }
}

async function cleanupPartialDataset(directory: FileSystemDirectoryHandle) {
  for (const name of ["dataset.json", "metadata.jsonl", "images"]) {
    try {
      await directory.removeEntry(name, { recursive: name === "images" });
    } catch {
      // Best-effort cleanup. The original error remains the actionable cause.
    }
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Dataset生成はキャンセルされました。", "AbortError");
  }
}
