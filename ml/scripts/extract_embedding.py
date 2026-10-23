"""Run one validated MandelGuessr PNG through DINOv2 Small on CPU."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from check_dataset import (
    DEFAULT_DATASET_DIR,
    DatasetValidationError,
    load_and_validate_dataset,
)
from dinov2_embedding import (
    MODEL_NAME,
    create_cpu_model_and_transform,
    infer_l2_normalized_embeddings,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dataset_dir",
        nargs="?",
        type=Path,
        default=DEFAULT_DATASET_DIR,
        help=f"dataset root (default: {DEFAULT_DATASET_DIR})",
    )
    args = parser.parse_args()

    try:
        dataset = load_and_validate_dataset(
            args.dataset_dir,
            preview_count=1,
            print_summary=False,
        )
    except DatasetValidationError as exc:
        print(f"Dataset INVALID: {exc}", file=sys.stderr)
        return 1

    try:
        torch, model, transform = create_cpu_model_and_transform()
    except ImportError as exc:
        print(
            "PyTorch/timm is not installed. Follow ml/README.md before running "
            f"this script: {exc}",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:  # The model download/runtime adds third-party errors.
        print(f"Embedding extraction failed: {exc}", file=sys.stderr)
        return 1

    first_sample = dataset.samples[0]
    image_path = dataset.image_paths[0]
    print(f"sample: {first_sample['id']} ({image_path.name})")
    print(f"model: {MODEL_NAME}")
    print("device: cpu")

    try:
        embedding = infer_l2_normalized_embeddings(
            [image_path],
            torch=torch,
            model=model,
            transform=transform,
        )
    except Exception as exc:  # Image/model inference adds third-party errors.
        print(f"Embedding extraction failed: {exc}", file=sys.stderr)
        return 1

    print(f"embedding shape: {embedding.shape}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
