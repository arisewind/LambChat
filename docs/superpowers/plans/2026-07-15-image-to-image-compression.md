# Image-to-Image Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress image-to-image inputs exceeding 5 MiB before their multipart upload, including sandbox-path inputs.

**Architecture:** Move the existing PIL JPEG compression policy into `src/infra/image_utils.py`. Chat vision conversion, image analysis (through `inline_image_attachments_as_data_urls`), and `image_generate` call that shared helper. Image-to-image replaces only inputs whose compressed JPEG is smaller, preserving original MIME/name otherwise and closing replaced temporary files safely.

**Tech Stack:** Python 3.12, Pillow, pytest, httpx, `SpooledTemporaryFile`.

---

### Task 1: Create the shared image compressor

**Files:**
- Create: `src/infra/image_utils.py`
- Modify: `src/agents/core/node_utils.py`
- Modify: `tests/agents/core/test_node_utils_multimodal.py`
- Test: `tests/infra/test_image_utils.py`

- [ ] **Step 1: Write failing tests for threshold, JPEG conversion, white alpha flattening, and compression failure logging.**

```python
def test_compress_large_transparent_image_flattens_alpha_to_white():
    source = make_noisy_transparent_png(width=2400, height=2400)
    compressed, mime = compress_image_bytes_if_needed(source, "image/png")
    assert mime == "image/jpeg"
    assert Image.open(BytesIO(compressed)).convert("RGB").getpixel((0, 0)) == (255, 255, 255)
```

- [ ] **Step 2: Run the new tests and verify they fail because the shared module does not exist.**

Run: `uv run pytest tests/infra/test_image_utils.py -q`

- [ ] **Step 3: Implement `compress_image_bytes_if_needed` in `src/infra/image_utils.py`.**

Use the existing `IMAGE_COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024` policy, Pillow `load()`, white RGB alpha flattening, JPEG quality 82/`optimize=True`, and return the original tuple when compression is not smaller or raises. Catch Pillow failures, emit a warning through the module logger, and verify that warning with `caplog`.

- [ ] **Step 4: Update `node_utils` and its existing tests to import the shared helper and remove its duplicate private implementation.**

- [ ] **Step 5: Run compressor and existing multimodal tests.**

Run: `uv run pytest tests/infra/test_image_utils.py tests/agents/core/test_node_utils_multimodal.py -q`

### Task 2: Compress image-to-image sources before multipart upload

**Files:**
- Modify: `src/infra/tool/image_generation_tool.py`
- Test: `tests/infra/tool/test_image_generation_tool.py`

- [ ] **Step 1: Write failing tests for oversized sandbox paths, public URLs, and data URLs.**

Mock the shared compressor and invoke `image_generate`; assert the image multipart part receives compressed bytes, `image/jpeg`, and a `.jpg` filename for each source type larger than 5 MiB.

- [ ] **Step 2: Run each new test and verify it fails because multipart files still use the original source.**

Run: `uv run pytest tests/infra/tool/test_image_generation_tool.py -k 'backend_path_compresses or url_compresses or data_url_compresses' -q`

- [ ] **Step 3: Add a focused async helper that conditionally replaces a `SpooledTemporaryFile`.**

The helper must use `run_blocking_io` for file reads, Pillow compression, and writes. If bytes or MIME are unchanged, retain the original file and name. If changed, create a replacement file, close the original, return `.jpg` filename and `image/jpeg` MIME. On every exception before returning, close both the original and any replacement it created.

- [ ] **Step 4: Invoke the helper for every `_download_image_source` result in `_call_edit_api`.**

Append only the final file handle to `source_files` so its `finally` closes it. If conditional replacement raises after creating a replacement, close the replacement before propagating.

- [ ] **Step 5: Run the new focused tests and verify they pass.**

Run: `uv run pytest tests/infra/tool/test_image_generation_tool.py -k 'backend_path_compresses or url_compresses or data_url_compresses' -q`

### Task 3: Preserve fallback and cleanup behavior

**Files:**
- Modify: `tests/infra/tool/test_image_generation_tool.py`

- [ ] **Step 1: Write failing tests for non-smaller/failing compression and temporary-file cleanup.**

Assert that a non-smaller or failing compressor leaves original content, MIME and filename in the request. Assert a successfully replaced original file is closed and the replacement is closed after a later source failure or API failure.

- [ ] **Step 2: Run these tests and verify any missing cleanup behavior fails.**

Run: `uv run pytest tests/infra/tool/test_image_generation_tool.py -k 'compression_fallback or compressed_source_cleanup' -q`

- [ ] **Step 3: Make the minimal lifecycle corrections.**

Do not alter URL download, upload, retry, or 20 MiB download-limit behavior.

- [ ] **Step 4: Run the complete related suites.**

Run: `uv run pytest tests/infra/test_image_utils.py tests/agents/core/test_node_utils_multimodal.py tests/infra/tool/test_image_generation_tool.py -q`

### Task 4: Final verification

**Files:**
- Verify: `src/infra/image_utils.py`, `src/agents/core/node_utils.py`, `src/infra/tool/image_generation_tool.py`

- [ ] **Step 1: Run formatting/static validation for modified Python code.**

Run: `uv run ruff check src/infra/image_utils.py src/agents/core/node_utils.py src/infra/tool/image_generation_tool.py tests/infra/test_image_utils.py tests/infra/tool/test_image_generation_tool.py`

- [ ] **Step 2: Run the related test suites and inspect the diff.**

Run: `uv run pytest tests/infra/test_image_utils.py tests/agents/core/test_node_utils_multimodal.py tests/infra/tool/test_image_generation_tool.py tests/infra/agent/test_image_url_middleware.py -q && git diff --check`
