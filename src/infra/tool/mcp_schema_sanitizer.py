"""
MCP 工具参数 schema 清洗工具。

某些 MCP server 声明的工具参数字段没有明确 type（或为 Optional 类型），
经 langchain-mcp-adapters 序列化后，JSON schema 中对应 property 的值可能为 None。
这对 Anthropic / OpenAI 协议无害，但 ``langchain-google-genai`` 在
``types.Schema.model_validate`` 阶段会拒绝 None 值的 property，抛出
``pydantic.ValidationError``，导致 Gemini 后端完全无法使用该工具。

本模块提供递归清洗 JSON schema、以及为 LangChain ``BaseTool`` 生成清洗后
``args_schema`` 子类的工具函数。

从 ``src/infra/tool/mcp_client.py`` 拆出，参考: issue #186
"""

from __future__ import annotations

from typing import Any, cast

from langchain_core.tools import BaseTool
from pydantic import BaseModel

from src.infra.logging import get_logger

logger = get_logger(__name__)


def _sanitize_json_schema(schema: Any) -> Any:
    """递归清洗 JSON schema，移除值为 None 的 property。

    本函数递归遍历 schema dict，删除所有值为 None 的 property / items / format 等，
    确保传给任意模型 provider 的 schema 都是合法的。

    参考: issue #186
    """

    if isinstance(schema, dict):
        cleaned: dict[str, Any] = {}
        for key, value in schema.items():
            if value is None:
                continue
            if key == "properties" and isinstance(value, dict):
                cleaned[key] = {
                    prop_name: _sanitize_json_schema(prop_schema)
                    for prop_name, prop_schema in value.items()
                    if prop_schema is not None
                }
            else:
                cleaned[key] = _sanitize_json_schema(value)
        return cleaned
    if isinstance(schema, list):
        return [_sanitize_json_schema(item) for item in schema if item is not None]
    return schema


def _attach_sanitized_schema(tool: BaseTool) -> BaseTool:
    """为工具的 args_schema 创建清洗后的 Pydantic 模型子类。

    旧方案（已弃用）：在原始 ``args_schema`` 类上 monkey-patch ``model_json_schema``
    classmethod。此方案有缺陷：LangChain 的 ``BaseTool.tool_call_schema`` 属性会通过
    ``_create_subset_model`` 创建**全新**的 Pydantic 模型，新模型不会继承 monkey-patch，
    导致清洗结果丢失。而 ``ChatGoogleGenerativeAI.bind_tools`` 在绑定时就通过
    ``convert_to_openai_tool`` → ``tool.tool_call_schema`` 将工具序列化为 OpenAI dict，
    所以 monkey-patch 完全无效。

    新方案：用 ``pydantic.create_model`` 创建不含 None 值字段的新 args_schema 类。
    这样无论 LangChain 通过 ``args_schema.model_json_schema()`` 还是
    ``tool_call_schema → _create_subset_model`` 获取 schema，都不会包含 None 值。

    幂等：重复调用不会叠加包装。

    参考: issue #186
    """

    args_schema = getattr(tool, "args_schema", None)
    if args_schema is None:
        return tool
    if getattr(args_schema, "_lambchat_schema_sanitized", False):
        return tool
    if not isinstance(args_schema, type):
        # args_schema 可能是 dict（非 Pydantic 模型），无法创建子类
        return tool

    # 上面 isinstance 检查确保 args_schema 是一个类；LangChain 的 BaseTool.args_schema
    # 约定为 pydantic 模型类，这里收窄类型以便访问 model_json_schema 等 classmethod。
    args_schema = cast("type[BaseModel]", args_schema)

    try:
        original_schema = args_schema.model_json_schema()
    except Exception:
        # schema 生成失败由上层 get_tools 的验证逻辑处理
        return tool

    sanitized = _sanitize_json_schema(original_schema)
    if sanitized == original_schema:
        # 无需清洗，避免不必要的子类化
        return tool

    # 识别需要移除的字段（原始 schema 中有 None 值的 property）
    original_props = original_schema.get("properties", {})
    sanitized_props = sanitized.get("properties", {})
    none_fields: set[str] = set(original_props.keys()) - set(sanitized_props.keys())

    if not none_fields:
        return tool

    # 同时检查嵌套结构中直接为 None 的非 property 顶层键
    # （如 "items": None, "format": None 等）
    # 这些不需要移除字段，只需要确保 model_json_schema 输出干净

    try:
        cleaned_schema = _create_sanitized_model_class(args_schema, none_fields)
    except Exception:
        # create_model 失败时回退到 monkey-patch（至少修复直接调用路径）
        logger.warning(
            "[MCP] Failed to create sanitized model class for tool '%s', "
            "falling back to monkey-patch",
            getattr(tool, "name", "<unknown>"),
        )
        _monkey_patch_model_json_schema(args_schema, sanitized)
        return tool

    try:
        tool.args_schema = cleaned_schema  # type: ignore[assignment]
    except (AttributeError, TypeError):
        logger.warning(
            "[MCP] Failed to set sanitized args_schema on tool '%s', falling back to monkey-patch",
            getattr(tool, "name", "<unknown>"),
        )
        _monkey_patch_model_json_schema(args_schema, sanitized)

    logger.debug(
        "[MCP] Sanitized args_schema for tool '%s' (removed %d None-valued fields: %s)",
        getattr(tool, "name", "<unknown>"),
        len(none_fields),
        none_fields,
    )
    return tool


def _create_sanitized_model_class(
    args_schema: type[BaseModel],
    exclude_fields: set[str],
) -> type[BaseModel]:
    """创建不含 None 值字段的新 Pydantic 模型类。

    使用 ``pydantic.create_model`` 基于原始模型的字段定义（排除有问题的字段）
    创建一个全新的模型类。新模型的 ``model_json_schema()`` 输出不包含 None 值，
    且 LangChain 的 ``_create_subset_model`` 基于新模型的注解创建子集模型时也不会
    引入 None 值。
    """
    from pydantic import Field, create_model
    from pydantic_core import PydanticUndefined

    new_fields: dict[str, Any] = {}
    for name, field_info in args_schema.model_fields.items():
        if name in exclude_fields:
            continue
        annotation = field_info.annotation
        if field_info.default is not PydanticUndefined:
            new_fields[name] = (annotation, Field(default=field_info.default))
        elif field_info.default_factory is not None:
            new_fields[name] = (
                annotation,
                Field(default_factory=field_info.default_factory),
            )
        else:
            # pydantic.create_model: 必需字段直接传 type，不要 tuple
            new_fields[name] = annotation

    # 使用 BaseModel 作为基类即可——此模型仅用于 LangChain 的
    # schema 序列化路径，不需要继承原始模型的 config。
    return create_model(  # type: ignore[misc]
        f"_Sanitized_{args_schema.__name__}",
        __base__=BaseModel,
        **new_fields,
    )


def _monkey_patch_model_json_schema(
    args_schema: type[BaseModel],
    sanitized_schema: dict[str, Any],
) -> None:
    """回退方案：直接在原始类上 monkey-patch ``model_json_schema``。

    仅在 ``_create_sanitized_model_class`` 失败时使用。此方案无法修复
    ``tool_call_schema → _create_subset_model`` 路径，但至少修复
    直接调用 ``args_schema.model_json_schema()`` 的路径。
    """
    original_model_json_schema = args_schema.model_json_schema

    def _cleaned_model_json_schema(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return sanitized_schema

    _cleaned_model_json_schema._lambchat_original = original_model_json_schema  # type: ignore[attr-defined]
    _cleaned_model_json_schema._lambchat_schema_sanitized = True  # type: ignore[attr-defined]

    try:
        args_schema.model_json_schema = _cleaned_model_json_schema  # type: ignore[method-assign]
        args_schema._lambchat_schema_sanitized = True  # type: ignore[attr-defined]
    except (AttributeError, TypeError):
        pass
