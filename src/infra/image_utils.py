"""Shared image transformation helpers."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from src.infra.logging import get_logger

logger = get_logger(__name__)

IMAGE_COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024
IMAGE_COMPRESSION_MAX_PIXELS = 40_000_000


def compress_image_bytes_if_needed(
    content: bytes,
    mime_type: str,
    *,
    threshold_bytes: int = IMAGE_COMPRESSION_THRESHOLD_BYTES,
    max_pixels: int = IMAGE_COMPRESSION_MAX_PIXELS,
) -> tuple[bytes, str]:
    """Compress oversized images for model requests without changing originals."""
    if len(content) <= threshold_bytes:
        return content, mime_type

    try:
        from PIL import Image

        with Image.open(BytesIO(content)) as image:
            pixel_count = image.width * image.height
            if pixel_count > max_pixels:
                raise ValueError(
                    f"Image has {pixel_count} pixels and exceeds pixel limit {max_pixels}"
                )
            image.load()
            output_image: Any = image
            if "A" in image.getbands() or "transparency" in image.info:
                rgba = image.convert("RGBA")
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(rgba)
                output_image = background.convert("RGB")
            elif image.mode not in ("RGB", "L"):
                output_image = image.convert("RGB")
            output = BytesIO()
            output_image.save(output, format="JPEG", quality=82, optimize=True)
            compressed = output.getvalue()
        if len(compressed) < len(content):
            return compressed, "image/jpeg"
    except Exception as exc:
        logger.warning("Failed to compress oversized image: %s", exc)
    return content, mime_type
