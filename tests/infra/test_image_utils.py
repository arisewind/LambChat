import logging
from io import BytesIO

from PIL import Image

from src.infra.image_utils import (
    IMAGE_COMPRESSION_THRESHOLD_BYTES,
    compress_image_bytes_if_needed,
)


def _transparent_png_over_threshold() -> bytes:
    source = BytesIO()
    Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(source, format="PNG")
    return source.getvalue() + b"x" * IMAGE_COMPRESSION_THRESHOLD_BYTES


def _palette_transparent_png_over_threshold() -> bytes:
    source = BytesIO()
    image = Image.new("P", (32, 32), 0)
    image.putpalette([255, 0, 0] + [0, 0, 0] * 255)
    image.save(source, format="PNG", transparency=0)
    return source.getvalue() + b"x" * IMAGE_COMPRESSION_THRESHOLD_BYTES


def test_compress_large_transparent_image_flattens_alpha_to_white():
    original = _transparent_png_over_threshold()

    compressed, mime_type = compress_image_bytes_if_needed(original, "image/png")

    with Image.open(BytesIO(compressed)) as image:
        pixel = image.convert("RGB").getpixel((0, 0))
    assert len(compressed) < len(original)
    assert mime_type == "image/jpeg"
    assert pixel == (255, 255, 255)


def test_compress_large_palette_transparency_flattens_to_white():
    original = _palette_transparent_png_over_threshold()

    compressed, mime_type = compress_image_bytes_if_needed(original, "image/png")

    with Image.open(BytesIO(compressed)) as image:
        pixel = image.convert("RGB").getpixel((0, 0))
    assert mime_type == "image/jpeg"
    assert pixel == (255, 255, 255)


def test_compress_small_image_keeps_original_content_and_mime_type():
    original = b"small-image"

    compressed, mime_type = compress_image_bytes_if_needed(original, "image/png")

    assert compressed == original
    assert mime_type == "image/png"


def test_compress_invalid_large_image_logs_warning_and_keeps_original(caplog):
    original = b"not-an-image" + b"x" * IMAGE_COMPRESSION_THRESHOLD_BYTES

    with caplog.at_level(logging.WARNING):
        compressed, mime_type = compress_image_bytes_if_needed(original, "image/png")

    assert compressed == original
    assert mime_type == "image/png"
    assert "Failed to compress oversized image" in caplog.text


def test_compress_refuses_image_over_pixel_limit(caplog):
    source = BytesIO()
    Image.new("RGB", (3, 2), "red").save(source, format="PNG")
    original = source.getvalue() + b"x" * IMAGE_COMPRESSION_THRESHOLD_BYTES

    with caplog.at_level(logging.WARNING):
        compressed, mime_type = compress_image_bytes_if_needed(
            original,
            "image/png",
            max_pixels=4,
        )

    assert compressed == original
    assert mime_type == "image/png"
    assert "exceeds pixel limit" in caplog.text
