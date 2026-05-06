"""Internal MCP server for persona preset operations."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI
from mcp.server.fastmcp import Context, FastMCP
from pydantic import BaseModel, Field

from src.infra.auth.jwt import create_access_token, verify_token
from src.infra.persona_preset.manager import PersonaPresetManager
from src.infra.role.storage import RoleStorage
from src.infra.user.storage import UserStorage
from src.kernel.config import settings
from src.kernel.exceptions import AuthenticationError, NotFoundError
from src.kernel.schemas.persona_preset import (
    PersonaPreset,
    PersonaPresetCreate,
    PersonaPresetStatus,
    PersonaPresetUpdate,
    PersonaPresetVisibility,
)
from src.kernel.schemas.user import TokenPayload

PERSONA_PRESET_MCP_SERVER_NAME = "lambchat_persona_presets"
PERSONA_PRESET_MCP_MOUNT_PATH = "/api/internal/mcp/persona-presets"
PERSONA_PRESET_MCP_ENDPOINT_PATH = "/mcp"

_server: FastMCP | None = None


class PersonaPresetToolResult(BaseModel):
    """Structured MCP result for persona preset mutations."""

    action: Literal["created", "updated"]
    entity_type: Literal["persona_preset"] = "persona_preset"
    preset: PersonaPreset
    message: str


async def resolve_persona_preset_mcp_user(user_id: str) -> TokenPayload | None:
    """Resolve the latest roles and permissions for a user ID."""
    user = await UserStorage().get_by_id(user_id)
    if not user:
        return None

    role_storage = RoleStorage()
    roles = await role_storage.get_by_names(user.roles or [])

    resolved_roles: list[str] = []
    permissions: set[str] = set()
    for role in roles:
        resolved_roles.append(role.name)
        for permission in role.permissions:
            permissions.add(permission if isinstance(permission, str) else permission.value)

    return TokenPayload(
        sub=user.id,
        username=user.username,
        roles=resolved_roles,
        permissions=sorted(permissions),
    )


async def user_can_use_persona_preset_mcp(user_id: str) -> bool:
    """Return whether a user should see persona preset MCP tools."""
    user = await resolve_persona_preset_mcp_user(user_id)
    if not user:
        return False
    return "persona_preset:write" in set(user.permissions)


def build_persona_preset_mcp_server_config(user_id: str) -> dict[str, Any]:
    """Build a per-user MCP client config for the internal persona server."""
    base_url = getattr(settings, "APP_BASE_URL", "").rstrip("/")
    if not base_url:
        base_url = f"http://127.0.0.1:{settings.PORT}"

    return {
        "transport": "streamable_http",
        "url": (f"{base_url}{PERSONA_PRESET_MCP_MOUNT_PATH}{PERSONA_PRESET_MCP_ENDPOINT_PATH}"),
        "headers": {
            "Authorization": f"Bearer {create_access_token(user_id)}",
        },
    }


async def _get_request_user(ctx: Context) -> TokenPayload:
    request = ctx.request_context.request
    if request is None:
        raise AuthenticationError("persona_preset_mcp_missing_request")

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AuthenticationError("persona_preset_mcp_missing_bearer_token")

    payload = verify_token(auth_header.removeprefix("Bearer ").strip())
    current_user = await resolve_persona_preset_mcp_user(payload.sub)
    if not current_user:
        raise AuthenticationError("persona_preset_mcp_user_not_found")

    if "persona_preset:write" not in set(current_user.permissions):
        raise AuthenticationError("persona_preset_mcp_missing_permission")

    return current_user


def _is_admin(user: TokenPayload) -> bool:
    return "persona_preset:admin" in set(user.permissions or [])


def _build_tool_result(
    *,
    action: Literal["created", "updated"],
    preset: PersonaPreset,
) -> PersonaPresetToolResult:
    action_text = "created" if action == "created" else "updated"
    return PersonaPresetToolResult(
        action=action,
        preset=preset,
        message=f"Persona preset '{preset.name}' {action_text}.",
    )


async def _resolve_preset_id_for_update(
    *,
    manager: PersonaPresetManager,
    current_user: TokenPayload,
    preset_id: str | None,
    current_name: str | None,
) -> str:
    if preset_id:
        return preset_id

    if not current_name or not current_name.strip():
        raise ValueError("Either preset_id or current_name is required")

    presets = await manager.list_presets(
        user_id=current_user.sub,
        is_admin=_is_admin(current_user),
        scope="user",
        q=current_name.strip(),
        limit=20,
    )
    exact_matches = [preset for preset in presets if preset.name == current_name.strip()]

    if len(exact_matches) == 1:
        return exact_matches[0].id
    if len(exact_matches) > 1:
        raise ValueError(f"Multiple persona presets named '{current_name}' were found")

    raise NotFoundError("persona_preset_not_found")


async def create_persona_preset_tool(
    *,
    name: str,
    system_prompt: str,
    description: str = "",
    avatar: str | None = None,
    tags: list[str] | None = None,
    skill_names: list[str] | None = None,
    visibility: PersonaPresetVisibility = PersonaPresetVisibility.PRIVATE,
    status: PersonaPresetStatus = PersonaPresetStatus.DRAFT,
    ctx: Context,
    manager: PersonaPresetManager | None = None,
) -> PersonaPresetToolResult:
    current_user = await _get_request_user(ctx)
    persona_manager = manager or PersonaPresetManager()
    preset = await persona_manager.create_preset(
        PersonaPresetCreate(
            name=name,
            description=description,
            avatar=avatar,
            tags=tags or [],
            system_prompt=system_prompt,
            skill_names=skill_names or [],
            visibility=visibility,
            status=status,
        ),
        user_id=current_user.sub,
        is_admin=_is_admin(current_user),
    )
    return _build_tool_result(action="created", preset=preset)


async def update_persona_preset_tool(
    *,
    ctx: Context,
    preset_id: str | None = None,
    current_name: str | None = None,
    name: str | None = None,
    description: str | None = None,
    avatar: str | None = None,
    tags: list[str] | None = None,
    system_prompt: str | None = None,
    skill_names: list[str] | None = None,
    visibility: PersonaPresetVisibility | None = None,
    status: PersonaPresetStatus | None = None,
    manager: PersonaPresetManager | None = None,
) -> PersonaPresetToolResult:
    current_user = await _get_request_user(ctx)
    persona_manager = manager or PersonaPresetManager()

    resolved_preset_id = await _resolve_preset_id_for_update(
        manager=persona_manager,
        current_user=current_user,
        preset_id=preset_id,
        current_name=current_name,
    )

    update_data = PersonaPresetUpdate(
        name=name,
        description=description,
        avatar=avatar,
        tags=tags,
        system_prompt=system_prompt,
        skill_names=skill_names,
        visibility=visibility,
        status=status,
    )
    if not update_data.model_dump(exclude_unset=True):
        raise ValueError("At least one field to update is required")

    preset = await persona_manager.update_preset(
        resolved_preset_id,
        update_data,
        user_id=current_user.sub,
        is_admin=_is_admin(current_user),
    )
    return _build_tool_result(action="updated", preset=preset)


def get_persona_preset_mcp_server() -> FastMCP:
    """Return the singleton persona preset MCP server."""
    global _server
    if _server is not None:
        return _server

    server = FastMCP(
        name=PERSONA_PRESET_MCP_SERVER_NAME,
        instructions=(
            "Use these tools to create or update the current user's private chat personas."
        ),
        streamable_http_path=PERSONA_PRESET_MCP_ENDPOINT_PATH,
    )

    @server.tool(name="create_persona_preset", structured_output=True)
    async def _create_persona_preset(
        name: str = Field(..., description="Persona preset name"),
        system_prompt: str = Field(..., description="System prompt for the persona"),
        description: str = Field(default="", description="Short persona description"),
        avatar: str | None = Field(default=None, description="Optional avatar URL"),
        tags: list[str] = Field(default_factory=list, description="Optional persona tags"),
        skill_names: list[str] = Field(
            default_factory=list,
            description="Optional skill names to associate with the persona",
        ),
        visibility: PersonaPresetVisibility = Field(
            default=PersonaPresetVisibility.PRIVATE,
            description="Persona visibility",
        ),
        status: PersonaPresetStatus = Field(
            default=PersonaPresetStatus.DRAFT,
            description="Persona status",
        ),
        ctx: Context = None,  # type: ignore[assignment]
    ) -> PersonaPresetToolResult:
        assert ctx is not None
        return await create_persona_preset_tool(
            name=name,
            system_prompt=system_prompt,
            description=description,
            avatar=avatar,
            tags=tags,
            skill_names=skill_names,
            visibility=visibility,
            status=status,
            ctx=ctx,
        )

    @server.tool(name="update_persona_preset", structured_output=True)
    async def _update_persona_preset(
        preset_id: str | None = Field(
            default=None,
            description="Exact preset id to update when known",
        ),
        current_name: str | None = Field(
            default=None,
            description="Existing persona name when preset id is unknown",
        ),
        name: str | None = Field(default=None, description="New persona name"),
        description: str | None = Field(default=None, description="New description"),
        avatar: str | None = Field(default=None, description="New avatar URL"),
        tags: list[str] | None = Field(default=None, description="Updated tags"),
        system_prompt: str | None = Field(
            default=None,
            description="Updated system prompt",
        ),
        skill_names: list[str] | None = Field(
            default=None,
            description="Updated persona skill names",
        ),
        visibility: PersonaPresetVisibility | None = Field(
            default=None,
            description="Updated visibility",
        ),
        status: PersonaPresetStatus | None = Field(
            default=None,
            description="Updated status",
        ),
        ctx: Context = None,  # type: ignore[assignment]
    ) -> PersonaPresetToolResult:
        assert ctx is not None
        return await update_persona_preset_tool(
            preset_id=preset_id,
            current_name=current_name,
            name=name,
            description=description,
            avatar=avatar,
            tags=tags,
            system_prompt=system_prompt,
            skill_names=skill_names,
            visibility=visibility,
            status=status,
            ctx=ctx,
        )

    _server = server
    return server


def mount_persona_preset_mcp(app: FastAPI) -> None:
    """Mount the internal persona preset MCP server onto the FastAPI app."""
    app.mount(PERSONA_PRESET_MCP_MOUNT_PATH, get_persona_preset_mcp_server().streamable_http_app())
