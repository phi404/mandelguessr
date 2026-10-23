"""Extract L2-normalized DINOv2 Small embeddings for a validated dataset."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from tqdm import tqdm

from check_dataset import (
    DEFAULT_DATASET_DIR,
    DatasetValidationError,
    ValidatedDataset,
    load_and_validate_dataset,
)
from dinov2_embedding import (
    EMBEDDING_DIMENSION,
    MODEL_NAME,
    create_cpu_model_and_transform,
    infer_l2_normalized_embeddings,
)


DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs" / "embeddings"


def _positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def extract_dataset_embeddings(
    dataset: ValidatedDataset,
    *,
    batch_size: int,
    limit: int | None,
) -> np.ndarray:
    """Load DINOv2 once, infer batches on CPU, and return float32 rows."""

    selected_paths = dataset.image_paths[:limit]
    torch, model, transform = create_cpu_model_and_transform()

    batches: list[np.ndarray] = []
    for start in tqdm(
        range(0, len(selected_paths), batch_size),
        desc="Extracting embeddings",
        unit="batch",
    ):
        image_paths = selected_paths[start : start + batch_size]
        embeddings = infer_l2_normalized_embeddings(
            image_paths,
            torch=torch,
            model=model,
            transform=transform,
        )
        batches.append(embeddings.detach().cpu().numpy().astype(np.float32, copy=False))

    matrix = np.concatenate(batches, axis=0)
    validate_embedding_matrix(matrix, expected_rows=len(selected_paths))
    return matrix


def validate_embedding_matrix(matrix: np.ndarray, *, expected_rows: int) -> None:
    """Reject malformed, non-finite, or non-normalized extraction output."""

    expected_shape = (expected_rows, EMBEDDING_DIMENSION)
    if matrix.shape != expected_shape:
        raise ValueError(
            f"unexpected embedding shape {matrix.shape}; expected {expected_shape}"
        )
    if not np.isfinite(matrix).all():
        raise ValueError("embeddings contain NaN or infinity")
    norms = np.linalg.norm(matrix, axis=1)
    if not np.allclose(norms, 1.0, rtol=1e-4, atol=1e-5):
        raise ValueError(
            "embeddings are not L2-normalized; "
            f"norm range is {norms.min():.6f}..{norms.max():.6f}"
        )


def write_embedding_outputs(
    output_dir: Path,
    dataset: ValidatedDataset,
    embeddings: np.ndarray,
) -> None:
    """Write the matrix and its row mapping without touching source data."""

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    embeddings_path = output_dir / "embeddings.npy"
    metadata_path = output_dir / "metadata.jsonl"
    temporary_embeddings = output_dir / ".embeddings.npy.tmp"
    temporary_metadata = output_dir / ".metadata.jsonl.tmp"

    with temporary_embeddings.open("wb") as stream:
        np.save(stream, embeddings, allow_pickle=False)

    records = []
    for index, (sample, image_path) in enumerate(
        zip(dataset.samples, dataset.image_paths, strict=True)
    ):
        if index >= embeddings.shape[0]:
            break
        records.append(
            {
                "id": sample["id"],
                "imagePath": image_path.relative_to(dataset.root).as_posix(),
                "embeddingIndex": index,
                "modelName": MODEL_NAME,
            }
        )
    temporary_metadata.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    temporary_embeddings.replace(embeddings_path)
    temporary_metadata.replace(metadata_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dataset_dir",
        nargs="?",
        type=Path,
        default=DEFAULT_DATASET_DIR,
        help=f"dataset root (default: {DEFAULT_DATASET_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--batch-size",
        type=_positive_integer,
        default=4,
        help="images per CPU inference batch (default: 4)",
    )
    parser.add_argument(
        "--limit",
        type=_positive_integer,
        help="process only the first N validated images",
    )
    args = parser.parse_args()

    try:
        dataset = load_and_validate_dataset(
            args.dataset_dir,
            preview_count=0,
            print_summary=False,
        )
        selected_count = min(args.limit or len(dataset.samples), len(dataset.samples))
        print(f"dataset: {dataset.root}")
        print(f"samples: {selected_count} / {len(dataset.samples)}")
        print(f"model: {MODEL_NAME}")
        print("device: cpu")
        embeddings = extract_dataset_embeddings(
            dataset,
            batch_size=args.batch_size,
            limit=selected_count,
        )
        write_embedding_outputs(args.output_dir, dataset, embeddings)
    except DatasetValidationError as exc:
        print(f"Dataset INVALID: {exc}", file=sys.stderr)
        return 1
    except ImportError as exc:
        print(
            "PyTorch/timm is not installed. Follow ml/README.md before running "
            f"this script: {exc}",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:  # Model download/inference adds third-party errors.
        print(f"Embedding extraction failed: {exc}", file=sys.stderr)
        return 1

    norms = np.linalg.norm(embeddings, axis=1)
    print(f"embedding shape: {embeddings.shape}")
    print(f"finite: {np.isfinite(embeddings).all()}")
    print(f"L2 norm range: {norms.min():.6f}..{norms.max():.6f}")
    print(f"saved: {args.output_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
