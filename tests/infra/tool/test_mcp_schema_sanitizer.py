"""Tests for MCP tool JSON schema sanitization.

Regression tests for issue #186: Gemini backend crashes with
``pydantic.ValidationError`` when an MCP tool's args_schema serializes
to a JSON schema containing ``None``-valued properties (e.g. ``urls``).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Load mcp_client module directly (bypassing src.infra.tool.__init__ which
# imports heavy optional deps).  We only need the two pure-Python helpers.
# ---------------------------------------------------------------------------

_MCP_CLIENT_PATH = (
    Path(__file__).resolve().parents[3]
    / "src"
    / "infra"
    / "tool"
    / "mcp_client.py"
)


def _load_mcp_client_helpers() -> Any:
    # Preload only the modules mcp_client.py needs at import time for the
    # helper functions we test.  We stub out src.infra.tool so the package
    # __init__ does not pull in openai/langchain-heavy modules.
    if "src.infra.tool" not in sys.modules:
        import types

        pkg = types.ModuleType("src.infra.tool")
        pkg.__path__ = []  # type: ignore[attr-defined]
        sys.modules["src.infra.tool"] = pkg

    spec = importlib.util.spec_from_file_location(
        "src.infra.tool.mcp_client", _MCP_CLIENT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["src.infra.tool.mcp_client"] = module
    spec.loader.exec_module(module)
    return module


_mcp_client = _load_mcp_client_helpers()
_sanitize_json_schema = _mcp_client._sanitize_json_schema
_attach_sanitized_schema = _mcp_client._attach_sanitized_schema


# ---------------------------------------------------------------------------
# _sanitize_json_schema
# ---------------------------------------------------------------------------


class TestSanitizeJsonSchema:
    def test_removes_none_valued_properties(self) -> None:
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "urls": None,  # problematic field
                "query": {"type": "string"},
            },
            "required": ["urls"],
        }
        result = _sanitize_json_schema(schema)
        assert "urls" not in result["properties"]
        assert result["properties"]["query"] == {"type": "string"}

    def test_recurses_into_nested_properties(self) -> None:
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "config": {
                    "type": "object",
                    "properties": {
                        "nested_none": None,
                        "nested_ok": {"type": "integer"},
                    },
                }
            },
        }
        result = _sanitize_json_schema(schema)
        nested = result["properties"]["config"]["properties"]
        assert "nested_none" not in nested
        assert nested["nested_ok"] == {"type": "integer"}

    def test_cleans_none_items_in_array(self) -> None:
        schema: dict[str, Any] = {
            "type": "array",
            "items": None,
        }
        result = _sanitize_json_schema(schema)
        assert "items" not in result
        assert result["type"] == "array"

    def test_cleans_none_format_and_top_level_keys(self) -> None:
        schema: dict[str, Any] = {
            "type": "string",
            "format": None,
            "description": "a field",
            "default": None,
        }
        result = _sanitize_json_schema(schema)
        assert "format" not in result
        assert "default" not in result
        assert result["description"] == "a field"

    def test_preserves_valid_schema_unchanged(self) -> None:
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "search query"},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        }
        result = _sanitize_json_schema(schema)
        assert result == schema

    def test_handles_empty_and_non_dict_input(self) -> None:
        assert _sanitize_json_schema({}) == {}
        assert _sanitize_json_schema([]) == []
        assert _sanitize_json_schema("string") == "string"
        assert _sanitize_json_schema(42) == 42

    def test_cleans_anyof_with_none_members(self) -> None:
        """Union/Optional types may produce anyOf with None entries."""
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "field": {"anyOf": [None, {"type": "string"}]},
            },
        }
        result = _sanitize_json_schema(schema)
        assert result["properties"]["field"]["anyOf"] == [{"type": "string"}]

    def test_filters_none_from_list_values(self) -> None:
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "some_list": [None, {"key": "value"}, None],
        }
        result = _sanitize_json_schema(schema)
        assert result["some_list"] == [{"key": "value"}]


# ---------------------------------------------------------------------------
# _attach_sanitized_schema (integration with a fake BaseTool)
# ---------------------------------------------------------------------------


class _FakeArgsSchema:
    """Minimal stand-in for a Pydantic model used as ``BaseTool.args_schema``."""

    _lambchat_schema_sanitized: bool = False

    @staticmethod
    def model_json_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "urls": None,  # simulates the bug
                "query": {"type": "string"},
            },
            "required": ["urls"],
        }


class _FakeTool:
    """Minimal stand-in for a LangChain ``BaseTool``."""

    def __init__(self, name: str = "extract") -> None:
        self.name = name
        self.args_schema = _FakeArgsSchema


class TestAttachSanitizedSchema:
    def test_cleans_none_property_from_tool_args_schema(self) -> None:

        tool = _FakeTool("tavily_extract")
        result_tool = _attach_sanitized_schema(tool)

        schema = result_tool.args_schema.model_json_schema()
        assert "urls" not in schema["properties"]
        assert "query" in schema["properties"]

    def test_idempotent_on_repeated_calls(self) -> None:

        tool = _FakeTool("tool_a")
        _attach_sanitized_schema(tool)
        # second call should be a no-op
        result = _attach_sanitized_schema(tool)
        assert result is tool
        assert tool.args_schema._lambchat_schema_sanitized is True

    def test_noop_when_schema_has_no_none(self) -> None:

        class _CleanSchema:
            _lambchat_schema_sanitized: bool = False

            @staticmethod
            def model_json_schema() -> dict[str, Any]:
                return {
                    "type": "object",
                    "properties": {"q": {"type": "string"}},
                }

        tool = _FakeTool.__new__(_FakeTool)
        tool.name = "clean_tool"
        tool.args_schema = _CleanSchema

        original_schema_method = _CleanSchema.model_json_schema
        result = _attach_sanitized_schema(tool)
        # schema method should not be replaced when no cleaning needed
        assert _CleanSchema.model_json_schema is original_schema_method
        assert result is tool

    def test_handles_missing_args_schema(self) -> None:

        tool = _FakeTool.__new__(_FakeTool)
        tool.name = "no_schema"
        tool.args_schema = None  # type: ignore[assignment]

        result = _attach_sanitized_schema(tool)
        assert result is tool
