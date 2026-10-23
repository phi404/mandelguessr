from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from check_dataset import DatasetValidationError, load_and_validate_dataset  # noqa: E402


class CheckDatasetTests(unittest.TestCase):
    def test_valid_dataset_is_fully_decoded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self._write_dataset(root, count=3)

            validated = load_and_validate_dataset(root, print_summary=False)

            self.assertEqual(validated.manifest["count"], 3)
            self.assertEqual(len(validated.samples), 3)
            self.assertEqual([path.name for path in validated.image_paths], [
                "000000.png",
                "000001.png",
                "000002.png",
            ])

    def test_unreferenced_png_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self._write_dataset(root, count=2)
            Image.new("RGB", (8, 6)).save(root / "images" / "unexpected.png")

            with self.assertRaisesRegex(DatasetValidationError, "unreferenced PNGs"):
                load_and_validate_dataset(root, print_summary=False)

    @staticmethod
    def _write_dataset(root: Path, *, count: int) -> None:
        images = root / "images"
        images.mkdir(parents=True)
        manifest = {
            "datasetVersion": 1,
            "count": count,
            "width": 8,
            "height": 6,
            "paletteId": "classic",
            "maxIterations": 100,
            "rendererVersion": "mandelbrot-renderer-v1",
            "paletteVersion": "classic-v2-upr-serialized-phase",
            "samplingMethod": "test",
            "generatedAt": "2026-08-31T00:00:00.000Z",
        }
        samples = []
        for index in range(count):
            sample_id = f"{index:06d}"
            samples.append({
                "id": sample_id,
                "centerRe": -0.75 + index * 0.001,
                "centerIm": 0.1,
                "zoom": 100,
                "width": 8,
                "height": 6,
                "paletteId": "classic",
                "maxIterations": 100,
                "rendererVersion": "mandelbrot-renderer-v1",
                "paletteVersion": "classic-v2-upr-serialized-phase",
            })
            Image.new("RGBA", (8, 6), (index, 20, 30, 255)).save(
                images / f"{sample_id}.png"
            )

        (root / "dataset.json").write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )
        (root / "metadata.jsonl").write_text(
            "\n".join(json.dumps(sample) for sample in samples) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
