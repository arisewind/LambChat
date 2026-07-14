# Image Generation Backend Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image generation reference images support runtime backend paths just as image analysis does.

**Architecture:** Classify input references before HTTP downloading. Backend paths are read from the injected runtime backend into a bounded spooled file; all other supported reference formats keep their current processing path.

**Tech Stack:** Python 3.12, LangChain tools, httpx, pytest.

---

### Task 1: Backend-path reference image test

**Files:**
- Modify: `tests/infra/tool/test_image_generation_tool.py`
- Modify: `src/infra/tool/image_generation_tool.py`

- [ ] **Step 1: Write the failing test**

Add a test invoking `image_generate` with an absolute backend image path. Supply a fake runtime backend, assert `adownload_files` receives the path, and assert the edit request multipart file contains the backend bytes with its MIME type and filename.

- [ ] **Step 2: Run test to verify failure**

Run: `uv run pytest tests/infra/tool/test_image_generation_tool.py::test_image_generate_uses_backend_path_for_reference_images -v`

Expected: FAIL because the path is currently converted to an HTTP URL.

- [ ] **Step 3: Implement minimal backend source handling**

Classify plain paths and `file://` references, obtain the runtime backend, download the file, enforce `_IMAGE_DOWNLOAD_MAX_BYTES`, then write bytes to a `SpooledTemporaryFile` through `run_blocking_io`. Derive MIME type and filename from the backend path.

- [ ] **Step 4: Run test to verify pass**

Run: `uv run pytest tests/infra/tool/test_image_generation_tool.py::test_image_generate_uses_backend_path_for_reference_images -v`

Expected: PASS.

### Task 2: Regression coverage

**Files:**
- Modify: `tests/infra/tool/test_image_generation_tool.py`

- [ ] **Step 1: Add failing edge-case test**

Verify `file://` and relative paths classify as backend paths, and oversized backend content is rejected before multipart submission.

- [ ] **Step 2: Run targeted tests**

Run: `uv run pytest tests/infra/tool/test_image_generation_tool.py -v`

- [ ] **Step 3: Verify formatting and types**

Run: `uv run ruff check src/infra/tool/image_generation_tool.py tests/infra/tool/test_image_generation_tool.py`
