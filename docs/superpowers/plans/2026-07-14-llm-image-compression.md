# LLM Image Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare accepted oversized image uploads as temporary compressed data URLs for LLM requests without losing their original URLs.

**Architecture:** Centralize the configured upload ceiling and 5 MB compression decision in `node_utils`. Attachment conversion preserves `url` and adds `data_url`; message construction selects `data_url` only for the multimodal image block. This prevents changes to persisted uploads and lets summaries retain the original link.

**Tech Stack:** Python 3.12, Pillow, pytest, pytest-asyncio.

---

### Task 1: Establish regression coverage

**Files:**
- Modify: `tests/agents/core/test_node_utils_multimodal.py`

- [x] **Step 1: Write failing tests** for the configured image upload ceiling, a 5 MB compression result, and URL preservation when a data URL is generated.
- [x] **Step 2: Run** `uv run pytest tests/agents/core/test_node_utils_multimodal.py -q` and confirm failures identify the current 2 MB / cleared-URL behavior.

### Task 2: Correct LLM image preparation

**Files:**
- Modify: `src/agents/core/node_utils.py`
- Test: `tests/agents/core/test_node_utils_multimodal.py`

- [x] **Step 1: Implement** a single configured upload-size limit and use it as the download ceiling.
- [x] **Step 2: Implement** 5 MB in-memory compression while retaining the original attachment URL.
- [x] **Step 3: Make** `build_human_message` prefer `data_url` for multimodal blocks and retain `url` for summaries.
- [x] **Step 4: Run** `uv run pytest tests/agents/core/test_node_utils_multimodal.py -q` and confirm it passes.

### Task 3: Verify middleware compatibility

**Files:**
- Modify: `tests/infra/agent/test_image_url_middleware.py` if required
- Test: `tests/infra/agent/test_image_url_middleware.py`

- [x] **Step 1: Run** `uv run pytest tests/infra/agent/test_image_url_middleware.py -q`.
- [x] **Step 2: Run** `uv run pytest tests/agents/core/test_node_utils_multimodal.py tests/infra/agent/test_image_url_middleware.py -q` and inspect the complete result.
