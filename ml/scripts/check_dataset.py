"""Validate a MandelGuessr dataset exported by Generator Lab."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError


DEFAULT_DATASET_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"
DATASET_REQUIRED_KEYS = {
    "datasetVersion",
    "count",
    "width",
    "height",
    "paletteId",
    "maxIterations",
    "rendererVersion",
    "paletteVersion",
    "samplingMethod",
}
SAMPLE_REQUIRED_KEYS = {
    "id",
    "centerRe",
    "centerIm",
    "zoom",
    "width",
    "height",
    "paletteId",
    "maxIterations",
    "rendererVersion",
    "paletteVersion",
}
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class DatasetValidationError(RuntimeError):
    """Raised when exported files disagree with their metadata."""


@dataclass(frozen=True)
class ValidatedDataset:
    root: Path
    manifest: dict[str, Any]
    samples: list[dict[str, Any]]
    image_paths: list[Path]


def load_and_validate_dataset(
    root: Path,
    *,
    preview_count: int = 3,
    print_summary: bool = True,
) -> ValidatedDataset:
    """Load every record and PNG, raising a precise error on inconsistency."""

    root = root.resolve()
    manifest_path = root / "dataset.json"
    metadata_path = root / "metadata.jsonl"
    images_dir = root / "images"

    manifest = _read_json_object(manifest_path, "dataset.json")
    _require_keys(manifest, DATASET_REQUIRED_KEYS, "dataset.json")
    _validate_manifest(manifest)
    samples = _read_jsonl(metadata_path)

    expected_count = manifest["count"]
    if len(samples) != expected_count:
        raise DatasetValidationError(
            f"dataset count is {expected_count}, but metadata.jsonl has "
            f"{len(samples)} records"
        )

    if not images_dir.is_dir():
        raise DatasetValidationError(f"images directory is missing: {images_dir}")

    ids: set[str] = set()
    image_paths: list[Path] = []
    for index, sample in enumerate(samples, start=1):
        label = f"metadata line {index}"
        _require_keys(sample, SAMPLE_REQUIRED_KEYS, label)
        sample_id = sample["id"]
        if not isinstance(sample_id, str) or not SAFE_ID.fullmatch(sample_id):
            raise DatasetValidationError(f"{label}: invalid id {sample_id!r}")
        if sample_id in ids:
            raise DatasetValidationError(f"{label}: duplicate id {sample_id!r}")
        ids.add(sample_id)
        _validate_sample(sample, manifest, label)
        image_paths.append(images_dir / f"{sample_id}.png")

    expected_png_names = {path.name for path in image_paths}
    actual_png_names = {
        path.name for path in images_dir.iterdir() if path.is_file() and path.suffix.lower() == ".png"
    }
    missing = sorted(expected_png_names - actual_png_names)
    extra = sorted(actual_png_names - expected_png_names)
    if missing or extra:
        details: list[str] = []
        if missing:
            details.append(f"missing PNGs: {_short_list(missing)}")
        if extra:
            details.append(f"unreferenced PNGs: {_short_list(extra)}")
        raise DatasetValidationError("; ".join(details))

    for sample, image_path in zip(samples, image_paths, strict=True):
        _validate_png(image_path, sample)

    validated = ValidatedDataset(root, manifest, samples, image_paths)
    if print_summary:
        _print_summary(validated, preview_count)
    return validated


def _read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise DatasetValidationError(f"{label} is missing: {path}") from exc
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DatasetValidationError(f"cannot read {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise DatasetValidationError(f"{label} must contain a JSON object")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise DatasetValidationError(f"metadata.jsonl is missing: {path}") from exc
    except (OSError, UnicodeError) as exc:
        raise DatasetValidationError(f"cannot read metadata.jsonl: {exc}") from exc

    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            raise DatasetValidationError(f"metadata.jsonl line {line_number} is blank")
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise DatasetValidationError(
                f"metadata.jsonl line {line_number} is invalid JSON: {exc}"
            ) from exc
        if not isinstance(record, dict):
            raise DatasetValidationError(
                f"metadata.jsonl line {line_number} must be a JSON object"
            )
        records.append(record)
    return records


def _require_keys(value: dict[str, Any], required: set[str], label: str) -> None:
    missing = sorted(required - value.keys())
    if missing:
        raise DatasetValidationError(f"{label}: missing keys: {', '.join(missing)}")


def _validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest["datasetVersion"] != 1:
        raise DatasetValidationError(
            f"unsupported datasetVersion: {manifest['datasetVersion']!r}"
        )
    _positive_integer(manifest["count"], "dataset count")
    _positive_integer(manifest["width"], "dataset width")
    _positive_integer(manifest["height"], "dataset height")
    _positive_integer(manifest["maxIterations"], "dataset maxIterations")
    for key in ("paletteId", "rendererVersion", "paletteVersion", "samplingMethod"):
        if not isinstance(manifest[key], str) or not manifest[key].strip():
            raise DatasetValidationError(f"dataset {key} must be a non-empty string")


def _validate_sample(
    sample: dict[str, Any], manifest: dict[str, Any], label: str
) -> None:
    for key in ("centerRe", "centerIm"):
        value = sample[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise DatasetValidationError(f"{label}: {key} must be finite")
    zoom = sample["zoom"]
    if isinstance(zoom, bool) or not isinstance(zoom, (int, float)) or not math.isfinite(zoom) or zoom <= 0:
        raise DatasetValidationError(f"{label}: zoom must be finite and greater than zero")

    for key in ("width", "height", "maxIterations"):
        _positive_integer(sample[key], f"{label} {key}")
    for key in ("paletteId", "rendererVersion", "paletteVersion"):
        if not isinstance(sample[key], str) or not sample[key].strip():
            raise DatasetValidationError(f"{label}: {key} must be a non-empty string")
    for key in (
        "width",
        "height",
        "paletteId",
        "maxIterations",
        "rendererVersion",
        "paletteVersion",
    ):
        if sample[key] != manifest[key]:
            raise DatasetValidationError(
                f"{label}: {key}={sample[key]!r} does not match "
                f"dataset.json value {manifest[key]!r}"
            )


def _positive_integer(value: Any, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise DatasetValidationError(f"{label} must be a positive integer")


def _validate_png(path: Path, sample: dict[str, Any]) -> None:
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                raise DatasetValidationError(
                    f"{path.name}: expected PNG, detected {image.format!r}"
                )
            image.verify()
        with Image.open(path) as image:
            expected_size = (sample["width"], sample["height"])
            if image.size != expected_size:
                raise DatasetValidationError(
                    f"{path.name}: size {image.size} does not match {expected_size}"
                )
            rgb = image.convert("RGB")
            rgb.load()
    except FileNotFoundError as exc:
        raise DatasetValidationError(f"PNG is missing: {path}") from exc
    except (OSError, UnidentifiedImageError) as exc:
        raise DatasetValidationError(f"cannot decode {path.name}: {exc}") from exc


def _print_summary(dataset: ValidatedDataset, preview_count: int) -> None:
    manifest = dataset.manifest
    print("Dataset OK")
    print(f"samples: {len(dataset.samples)}")
    print(f"image size: {manifest['width']}x{manifest['height']}")
    print(f"palette: {manifest['paletteId']}")
    print(f"renderer: {manifest['rendererVersion']}")
    print(f"palette version: {manifest['paletteVersion']}")
    for sample in dataset.samples[: max(0, preview_count)]:
        print(
            f"  {sample['id']}: center=({sample['centerRe']}, "
            f"{sample['centerIm']}), zoom={sample['zoom']}"
        )


def _short_list(values: list[str], limit: int = 8) -> str:
    shown = ", ".join(values[:limit])
    return shown if len(values) <= limit else f"{shown}, ... ({len(values)} total)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dataset_dir",
        nargs="?",
        type=Path,
        default=DEFAULT_DATASET_DIR,
        help=f"dataset root (default: {DEFAULT_DATASET_DIR})",
    )
    parser.add_argument("--preview", type=int, default=3)
    args = parser.parse_args()
    try:
        load_and_validate_dataset(args.dataset_dir, preview_count=args.preview)
    except DatasetValidationError as exc:
        print(f"Dataset INVALID: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
