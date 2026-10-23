from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from cluster_embeddings import (  # noqa: E402
    cluster_embedding_matrix,
    load_embedding_inputs,
    write_cluster_outputs,
)
from extract_embeddings import validate_embedding_matrix  # noqa: E402


class EmbeddingPipelineTests(unittest.TestCase):
    def test_embedding_validation_accepts_normalized_384d_rows(self) -> None:
        embeddings = self._normalized_embeddings()

        validate_embedding_matrix(embeddings, expected_rows=embeddings.shape[0])

    def test_kmeans_assigns_every_row_and_generates_gallery(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            dataset_dir = root / "data" / "raw"
            images_dir = dataset_dir / "images"
            embeddings_dir = root / "outputs" / "embeddings"
            cluster_dir = root / "outputs" / "clusters" / "k2"
            images_dir.mkdir(parents=True)
            embeddings_dir.mkdir(parents=True)

            embeddings = self._normalized_embeddings()
            with (embeddings_dir / "embeddings.npy").open("wb") as stream:
                np.save(stream, embeddings, allow_pickle=False)

            records = []
            for index in range(embeddings.shape[0]):
                sample_id = f"{index:06d}"
                image_path = images_dir / f"{sample_id}.png"
                Image.new("RGB", (16, 10), (index * 20, 30, 40)).save(image_path)
                records.append(
                    {
                        "id": sample_id,
                        "imagePath": f"images/{sample_id}.png",
                        "embeddingIndex": index,
                    }
                )
            (embeddings_dir / "metadata.jsonl").write_text(
                "".join(json.dumps(record) + "\n" for record in records),
                encoding="utf-8",
            )

            loaded, loaded_records, image_paths = load_embedding_inputs(
                embeddings_dir,
                dataset_dir,
            )
            estimator, labels, distances = cluster_embedding_matrix(
                loaded,
                clusters=2,
                random_state=42,
            )
            write_cluster_outputs(
                cluster_dir,
                loaded_records,
                image_paths,
                estimator,
                labels,
                distances,
                random_state=42,
                max_images_per_cluster=2,
            )

            assignments = [
                json.loads(line)
                for line in (cluster_dir / "assignments.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            self.assertEqual(len(assignments), embeddings.shape[0])
            self.assertTrue(all(0 <= row["clusterId"] < 2 for row in assignments))
            self.assertTrue((cluster_dir / "cluster_summary.json").is_file())
            html = (cluster_dir / "index.html").read_text(encoding="utf-8")
            self.assertIn("Cluster 0", html)
            self.assertIn("Cluster 1", html)
            self.assertIn("nearest to centroid first", html)

    @staticmethod
    def _normalized_embeddings() -> np.ndarray:
        embeddings = np.zeros((6, 384), dtype=np.float32)
        embeddings[:3, 0] = 1.0
        embeddings[3:, 1] = 1.0
        embeddings[:, 2] = np.linspace(0.01, 0.06, 6, dtype=np.float32)
        embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
        return embeddings


if __name__ == "__main__":
    unittest.main()
