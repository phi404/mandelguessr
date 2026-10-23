"""Cluster saved DINOv2 embeddings and build a static image gallery."""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from urllib.parse import quote

import numpy as np
from sklearn.cluster import KMeans

from check_dataset import DEFAULT_DATASET_DIR
from dinov2_embedding import EMBEDDING_DIMENSION


ML_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EMBEDDINGS_DIR = ML_ROOT / "outputs" / "embeddings"
DEFAULT_CLUSTERS_ROOT = ML_ROOT / "outputs" / "clusters"
REQUIRED_METADATA_KEYS = {"id", "imagePath", "embeddingIndex"}


def _positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def load_embedding_inputs(
    embeddings_dir: Path,
    dataset_dir: Path,
) -> tuple[np.ndarray, list[dict[str, object]], list[Path]]:
    """Load and validate a matrix, row metadata, and referenced PNG paths."""

    embeddings_dir = embeddings_dir.resolve()
    dataset_dir = dataset_dir.resolve()
    embeddings_path = embeddings_dir / "embeddings.npy"
    metadata_path = embeddings_dir / "metadata.jsonl"

    try:
        embeddings = np.load(embeddings_path, allow_pickle=False)
    except (OSError, ValueError) as exc:
        raise ValueError(f"cannot load {embeddings_path}: {exc}") from exc
    if embeddings.ndim != 2 or embeddings.shape[1] != EMBEDDING_DIMENSION:
        raise ValueError(
            f"expected embeddings with shape (N, {EMBEDDING_DIMENSION}), "
            f"got {embeddings.shape}"
        )
    if embeddings.shape[0] == 0:
        raise ValueError("embeddings contain no rows")
    if not np.isfinite(embeddings).all():
        raise ValueError("embeddings contain NaN or infinity")
    norms = np.linalg.norm(embeddings, axis=1)
    if not np.allclose(norms, 1.0, rtol=1e-4, atol=1e-5):
        raise ValueError(
            "embeddings are not L2-normalized; "
            f"norm range is {norms.min():.6f}..{norms.max():.6f}"
        )

    try:
        lines = metadata_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"cannot read {metadata_path}: {exc}") from exc
    if len(lines) != embeddings.shape[0]:
        raise ValueError(
            f"metadata has {len(lines)} rows, but embeddings has "
            f"{embeddings.shape[0]} rows"
        )

    records_by_index: list[dict[str, object] | None] = [None] * embeddings.shape[0]
    image_paths_by_index: list[Path | None] = [None] * embeddings.shape[0]
    seen_ids: set[str] = set()
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            raise ValueError(f"metadata line {line_number} is blank")
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"metadata line {line_number} is invalid JSON: {exc}"
            ) from exc
        if not isinstance(record, dict):
            raise ValueError(f"metadata line {line_number} must be a JSON object")
        missing = REQUIRED_METADATA_KEYS - record.keys()
        if missing:
            raise ValueError(
                f"metadata line {line_number} is missing: {', '.join(sorted(missing))}"
            )

        sample_id = record["id"]
        embedding_index = record["embeddingIndex"]
        image_path_value = record["imagePath"]
        if not isinstance(sample_id, str) or not sample_id:
            raise ValueError(f"metadata line {line_number}: id must be a string")
        if sample_id in seen_ids:
            raise ValueError(f"metadata line {line_number}: duplicate id {sample_id!r}")
        seen_ids.add(sample_id)
        if (
            isinstance(embedding_index, bool)
            or not isinstance(embedding_index, int)
            or not 0 <= embedding_index < embeddings.shape[0]
        ):
            raise ValueError(
                f"metadata line {line_number}: invalid embeddingIndex "
                f"{embedding_index!r}"
            )
        if records_by_index[embedding_index] is not None:
            raise ValueError(f"duplicate embeddingIndex {embedding_index}")
        if not isinstance(image_path_value, str) or not image_path_value:
            raise ValueError(
                f"metadata line {line_number}: imagePath must be a string"
            )

        image_path = (dataset_dir / Path(image_path_value)).resolve()
        try:
            image_path.relative_to(dataset_dir)
        except ValueError as exc:
            raise ValueError(
                f"metadata line {line_number}: imagePath leaves dataset root"
            ) from exc
        if not image_path.is_file():
            raise ValueError(f"referenced image is missing: {image_path}")
        records_by_index[embedding_index] = record
        image_paths_by_index[embedding_index] = image_path

    if any(record is None for record in records_by_index):
        raise ValueError("metadata does not map every embedding index")
    return (
        embeddings.astype(np.float32, copy=False),
        [record for record in records_by_index if record is not None],
        [path for path in image_paths_by_index if path is not None],
    )


def cluster_embedding_matrix(
    embeddings: np.ndarray,
    *,
    clusters: int,
    random_state: int,
) -> tuple[KMeans, np.ndarray, np.ndarray]:
    """Fit reproducible K-means and compute each row's centroid distance."""

    if clusters > embeddings.shape[0]:
        raise ValueError(
            f"clusters ({clusters}) cannot exceed sample count ({embeddings.shape[0]})"
        )
    estimator = KMeans(
        n_clusters=clusters,
        random_state=random_state,
        n_init=10,
    )
    labels = estimator.fit_predict(embeddings)
    distances = np.linalg.norm(embeddings - estimator.cluster_centers_[labels], axis=1)
    if labels.shape != (embeddings.shape[0],):
        raise ValueError("K-means did not assign every embedding")
    if labels.min() < 0 or labels.max() >= clusters:
        raise ValueError("K-means produced a cluster ID outside the requested range")
    return estimator, labels, distances


def write_cluster_outputs(
    output_dir: Path,
    records: Sequence[dict[str, object]],
    image_paths: Sequence[Path],
    estimator: KMeans,
    labels: np.ndarray,
    distances: np.ndarray,
    *,
    random_state: int,
    max_images_per_cluster: int,
) -> None:
    """Write assignments, a machine-readable summary, and a static gallery."""

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    assignments = []
    for index, (record, label, distance) in enumerate(
        zip(records, labels, distances, strict=True)
    ):
        assignments.append(
            {
                "id": record["id"],
                "imagePath": record["imagePath"],
                "embeddingIndex": index,
                "clusterId": int(label),
                "distanceToCentroid": float(distance),
            }
        )

    assignments_path = output_dir / "assignments.jsonl"
    assignments_path.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in assignments),
        encoding="utf-8",
    )

    cluster_rows = []
    for cluster_id in range(estimator.n_clusters):
        member_indices = np.flatnonzero(labels == cluster_id)
        cluster_rows.append(
            {
                "clusterId": cluster_id,
                "count": int(member_indices.size),
                "displayedCount": min(int(member_indices.size), max_images_per_cluster),
            }
        )
    summary = {
        "algorithm": "sklearn.cluster.KMeans",
        "clusters": estimator.n_clusters,
        "samples": len(records),
        "embeddingDimension": int(estimator.cluster_centers_.shape[1]),
        "randomState": random_state,
        "nInit": estimator.n_init,
        "inertia": float(estimator.inertia_),
        "iterations": int(estimator.n_iter_),
        "maxImagesPerCluster": max_images_per_cluster,
        "clusterSummary": cluster_rows,
    }
    (output_dir / "cluster_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (output_dir / "index.html").write_text(
        build_gallery_html(
            output_dir,
            assignments,
            image_paths,
            estimator.n_clusters,
            max_images_per_cluster,
        ),
        encoding="utf-8",
    )


def build_gallery_html(
    output_dir: Path,
    assignments: Sequence[dict[str, object]],
    image_paths: Sequence[Path],
    clusters: int,
    max_images_per_cluster: int,
) -> str:
    """Build an offline gallery ordered by distance to each centroid."""

    sections = []
    for cluster_id in range(clusters):
        members = [
            (assignment, image_paths[index])
            for index, assignment in enumerate(assignments)
            if assignment["clusterId"] == cluster_id
        ]
        members.sort(key=lambda item: float(item[0]["distanceToCentroid"]))
        shown = members[:max_images_per_cluster]
        cards = []
        for assignment, image_path in shown:
            relative_path = Path(os.path.relpath(image_path, output_dir)).as_posix()
            image_url = quote(relative_path, safe="/.")
            sample_id = html.escape(str(assignment["id"]))
            distance = float(assignment["distanceToCentroid"])
            cards.append(
                "<figure>"
                f'<a href="{image_url}"><img src="{image_url}" '
                f'alt="{sample_id}" loading="lazy"></a>'
                f"<figcaption>{sample_id}<br>distance {distance:.4f}</figcaption>"
                "</figure>"
            )
        omitted = len(members) - len(shown)
        omitted_note = (
            f'<p class="omitted">{omitted} more image(s) not displayed.</p>'
            if omitted
            else ""
        )
        sections.append(
            f'<section><h2>Cluster {cluster_id} '
            f'<span>{len(members)} image(s)</span></h2>'
            f'<div class="grid">{"".join(cards)}</div>{omitted_note}</section>'
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MandelGuessr DINOv2 clusters</title>
  <style>
    :root {{ color-scheme: dark; font-family: system-ui, sans-serif; }}
    body {{ margin: 0 auto; max-width: 1600px; padding: 24px; background: #101114; color: #f4f4f5; }}
    header {{ margin-bottom: 32px; }}
    h1 {{ margin-bottom: 8px; }}
    h2 {{ border-top: 1px solid #34363c; padding-top: 24px; }}
    h2 span, .omitted, header p {{ color: #a1a1aa; font-size: 0.9rem; font-weight: 400; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }}
    figure {{ margin: 0; padding: 8px; background: #1b1d22; border-radius: 8px; }}
    img {{ display: block; width: 100%; aspect-ratio: 8 / 5; object-fit: cover; border-radius: 4px; }}
    figcaption {{ margin-top: 7px; color: #d4d4d8; font: 12px/1.45 ui-monospace, monospace; }}
  </style>
</head>
<body>
  <header>
    <h1>MandelGuessr DINOv2 clusters</h1>
    <p>{len(assignments)} embeddings, {clusters} clusters. Up to {max_images_per_cluster} images per cluster, nearest to centroid first.</p>
  </header>
  {''.join(sections)}
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dataset_dir",
        nargs="?",
        type=Path,
        default=DEFAULT_DATASET_DIR,
        help=f"dataset root used by imagePath (default: {DEFAULT_DATASET_DIR})",
    )
    parser.add_argument(
        "--embeddings-dir",
        type=Path,
        default=DEFAULT_EMBEDDINGS_DIR,
        help=f"embedding input directory (default: {DEFAULT_EMBEDDINGS_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="output directory (default: ml/outputs/clusters/k<clusters>)",
    )
    parser.add_argument(
        "--clusters",
        type=_positive_integer,
        default=20,
        help="number of K-means clusters (default: 20)",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="K-means random seed (default: 42)",
    )
    parser.add_argument(
        "--max-images-per-cluster",
        type=_positive_integer,
        default=50,
        help="gallery image limit for each cluster (default: 50)",
    )
    args = parser.parse_args()
    output_dir = args.output_dir or DEFAULT_CLUSTERS_ROOT / f"k{args.clusters}"

    try:
        embeddings, records, image_paths = load_embedding_inputs(
            args.embeddings_dir,
            args.dataset_dir,
        )
        estimator, labels, distances = cluster_embedding_matrix(
            embeddings,
            clusters=args.clusters,
            random_state=args.random_state,
        )
        write_cluster_outputs(
            output_dir,
            records,
            image_paths,
            estimator,
            labels,
            distances,
            random_state=args.random_state,
            max_images_per_cluster=args.max_images_per_cluster,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Clustering failed: {exc}", file=sys.stderr)
        return 1

    print(f"embedding shape: {embeddings.shape}")
    print(f"assigned samples: {labels.size}")
    print(f"cluster ID range: {labels.min()}..{labels.max()}")
    print(f"inertia: {estimator.inertia_:.6f}")
    print(f"saved: {output_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
