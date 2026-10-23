"""Shared DINOv2 Small model setup and CPU inference helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from PIL import Image


MODEL_NAME = "vit_small_patch14_dinov2.lvd142m"
EMBEDDING_DIMENSION = 384


def create_cpu_model_and_transform() -> tuple[Any, Any, Any]:
    """Load the pretrained model once and return torch, model, and transform."""

    import timm
    import torch
    from timm.data import create_transform, resolve_model_data_config

    model = timm.create_model(MODEL_NAME, pretrained=True, num_classes=0)
    model = model.to(torch.device("cpu"))
    model.eval()
    transform = create_transform(
        **resolve_model_data_config(model),
        is_training=False,
    )
    return torch, model, transform


def transform_images(image_paths: Iterable[Path], transform: Any) -> list[Any]:
    """Decode images as RGB and apply the model's inference transform."""

    tensors = []
    for image_path in image_paths:
        with Image.open(image_path) as image:
            tensors.append(transform(image.convert("RGB")))
    return tensors


def infer_l2_normalized_embeddings(
    image_paths: Iterable[Path],
    *,
    torch: Any,
    model: Any,
    transform: Any,
) -> Any:
    """Return one L2-normalized embedding row for every supplied image."""

    tensors = transform_images(image_paths, transform)
    if not tensors:
        raise ValueError("at least one image is required")
    batch = torch.stack(tensors)
    with torch.inference_mode():
        embeddings = model(batch)
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
    return embeddings
