"""Tests for MCP tool JSON schema sanitization.

Regression tests for issue #186: Gemini backend crashes with
``pydantic.ValidationError`` when an MCP tool's args_schema serializes
to a JSON schema containing ``None``-valued properties (e.g. ``urls``).

Root cause: ``ChatGoogleGenerativeAI.bind_tools`` calls
``convert_to_openai_tool`` which uses ``tool.tool_call_schema`` (NOT
``tool.args_schema``).  ``tool_call_schema`` creates a *new* Pydantic
model via ``_create_subset_model`` from the field annotations of the
original ``args_schema``.  A simple monkey-patch of
``args_schema.model_json_schema`` is therefore **invisible** to the
bind_tools path.  The fix creates a new ``args_schema`` model class that
excludes the None-valued fields entirely, so that *every* downstream
code path (``model_json_schema``, ``tool_call_schema``,
``_create_subset_model``) produces clean output.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from src.infra.tool.mcp_client import (
    _attach_sanitized_schema,
    _create_sanitized_model_class,
    _monkey_patch_model_json_schema,
    _sanitize_json_schema,
)

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
# _create_sanitized_model_class
# ---------------------------------------------------------------------------


class _BrokenArgsSchema(BaseModel):
    """Simulates an MCP tool whose ``urls`` field has a broken type that
    causes ``model_json_schema()`` to emit ``properties.urls: None``.

    We override ``model_json_schema`` to inject the problematic output,
    matching what langchain-mcp-adapters produces for Tavily-style tools.
    """

    query: str
    urls: Any = None  # type: ignore[assignment]

    @classmethod
    def model_json_schema(cls, *args: Any, **kwargs: Any) -> dict[str, Any]:
        schema = super().model_json_schema(*args, **kwargs)
        # Simulate the broken MCP adapter behavior
        schema["properties"]["urls"] = None
        return schema


class TestCreateSanitizedModelClass:
    def test_excludes_none_valued_fields(self) -> None:
        cleaned = _create_sanitized_model_class(_BrokenArgsSchema, exclude_fields={"urls"})
        fields = list(cleaned.model_fields.keys())
        assert "query" in fields
        assert "urls" not in fields

    def test_clean_model_json_schema_has_no_none(self) -> None:
        cleaned = _create_sanitized_model_class(_BrokenArgsSchema, exclude_fields={"urls"})
        schema = cleaned.model_json_schema()
        assert "urls" not in schema["properties"]
        assert "query" in schema["properties"]

    def test_preserves_valid_fields(self) -> None:
        cleaned = _create_sanitized_model_class(_BrokenArgsSchema, exclude_fields={"urls"})
        assert cleaned.model_fields["query"].annotation is str

    def test_empty_exclude_returns_original_like_model(self) -> None:
        cleaned = _create_sanitized_model_class(_BrokenArgsSchema, exclude_fields=set())
        fields = list(cleaned.model_fields.keys())
        assert "query" in fields
        assert "urls" in fields


# ---------------------------------------------------------------------------
# _attach_sanitized_schema (integration with a fake BaseTool)
# ---------------------------------------------------------------------------


class _FakeTool:
    """Minimal stand-in for a LangChain ``BaseTool``."""

    def __init__(self, name: str = "extract", args_schema: type | None = None) -> None:
        self.name = name
        self.args_schema: type | None = args_schema


class TestAttachSanitizedSchema:
    def test_creates_clean_args_schema_without_none_fields(self) -> None:
        tool = _FakeTool("tavily_extract", args_schema=_BrokenArgsSchema)
        result = _attach_sanitized_schema(tool)

        # The tool should have a NEW args_schema class (not the original)
        assert result.args_schema is not _BrokenArgsSchema
        schema = result.args_schema.model_json_schema()
        assert "urls" not in schema["properties"]
        assert "query" in schema["properties"]

    def test_idempotent_on_repeated_calls(self) -> None:
        tool = _FakeTool("tool_a", args_schema=_BrokenArgsSchema)
        result1 = _attach_sanitized_schema(tool)
        result2 = _attach_sanitized_schema(tool)
        assert result1 is tool
        assert result2 is tool

    def test_noop_when_schema_has_no_none(self) -> None:

        class _CleanSchema(BaseModel):
            q: str

        tool = _FakeTool("clean_tool", args_schema=_CleanSchema)
        result = _attach_sanitized_schema(tool)
        assert result is tool
        assert tool.args_schema is _CleanSchema

    def test_handles_missing_args_schema(self) -> None:
        tool = _FakeTool("no_schema", args_schema=None)
        result = _attach_sanitized_schema(tool)
        assert result is tool

    def test_handles_dict_args_schema(self) -> None:
        """args_schema as a plain dict is not a type; should be no-op."""
        tool = _FakeTool("dict_schema", args_schema={"type": "object"})  # type: ignore[arg-type]
        result = _attach_sanitized_schema(tool)
        assert result is tool

    def test_sanitized_schema_produces_clean_tool_call_schema(self) -> None:
        """Verify that the sanitized args_schema would produce a clean
        ``tool_call_schema`` — the critical path used by
        ``bind_tools → convert_to_openai_tool``.

        We don't have full LangChain ``BaseTool`` here, but we can verify
        that ``_create_subset_model`` (called by ``tool_call_schema``)
        would see clean annotations by checking that a model built from
        the sanitized args_schema's fields produces no None-valued
        properties.
        """
        tool = _FakeTool("tavily_extract", args_schema=_BrokenArgsSchema)
        result = _attach_sanitized_schema(tool)
        assert result.args_schema is not None

        # Verify model_json_schema on the cleaned class is clean
        schema = result.args_schema.model_json_schema()
        for prop_name, prop_val in schema.get("properties", {}).items():
            assert prop_val is not None, (
                f"Property '{prop_name}' still has None value after sanitization"
            )

    def test_sanitized_schema_preserves_field_validation(self) -> None:
        """Ensure the sanitized model can still validate correct input."""
        tool = _FakeTool("tavily_extract", args_schema=_BrokenArgsSchema)
        result = _attach_sanitized_schema(tool)
        assert result.args_schema is not None

        # The 'query' field should still work
        instance = result.args_schema(query="test")
        assert instance.query == "test"
        # 'urls' should not be a field anymore (removed by sanitization)
        assert "urls" not in result.args_schema.model_fields


# ---------------------------------------------------------------------------
# _monkey_patch_model_json_schema (fallback)
# ---------------------------------------------------------------------------


class TestMonkeyPatchFallback:
    def test_patches_model_json_schema_on_class(self) -> None:
        class _TestSchema(BaseModel):
            query: str
            urls: Any = None  # type: ignore[assignment]

            @classmethod
            def model_json_schema(cls, *args: Any, **kwargs: Any) -> dict[str, Any]:
                schema = super().model_json_schema(*args, **kwargs)
                schema["properties"]["urls"] = None
                return schema

        sanitized = {"type": "object", "properties": {"query": {"type": "string"}}}
        _monkey_patch_model_json_schema(_TestSchema, sanitized)

        schema = _TestSchema.model_json_schema()
        assert "urls" not in schema["properties"]
        assert schema["properties"]["query"] == {"type": "string"}
