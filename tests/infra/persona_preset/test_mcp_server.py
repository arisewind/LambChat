from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from starlette.routing import Mount

from src.infra.persona_preset import mcp_server
from src.kernel.schemas.persona_preset import (
    PersonaPreset,
    PersonaPresetScope,
    PersonaPresetStatus,
    PersonaPresetVisibility,
)
from src.kernel.schemas.user import TokenPayload


def _fake_user(*permissions: str) -> TokenPayload:
    return TokenPayload(
        sub="user-1",
        username="tester",
        roles=["user"],
        permissions=list(permissions),
    )


def _fake_ctx(auth_header: str = "Bearer fake-token") -> SimpleNamespace:
    return SimpleNamespace(
        request_context=SimpleNamespace(
            request=SimpleNamespace(headers={"authorization": auth_header})
        )
    )


def _preset(name: str = "Planner", description: str = "Plan carefully") -> PersonaPreset:
    return PersonaPreset(
        id="preset-1",
        scope=PersonaPresetScope.USER,
        owner_user_id="user-1",
        name=name,
        description=description,
        avatar=None,
        tags=["planning"],
        system_prompt="You are a careful planner.",
        skill_names=["planner"],
        visibility=PersonaPresetVisibility.PRIVATE,
        status=PersonaPresetStatus.DRAFT,
        source_preset_id=None,
        copied_from_version=None,
        version=1,
        usage_count=0,
        created_by="user-1",
        updated_by="user-1",
        created_at=datetime(2026, 5, 6),
        updated_at=datetime(2026, 5, 6),
    )


@pytest.mark.asyncio
async def test_create_persona_preset_tool_returns_structured_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = _preset()

    async def _fake_user_resolver(user_id: str):
        assert user_id == "user-1"
        return _fake_user("persona_preset:write")

    class _FakeManager:
        async def create_preset(self, preset_data, *, user_id: str, is_admin: bool):
            assert user_id == "user-1"
            assert is_admin is False
            assert preset_data.name == "Planner"
            assert preset_data.scope == PersonaPresetScope.USER
            return created

    monkeypatch.setattr(mcp_server, "resolve_persona_preset_mcp_user", _fake_user_resolver)
    monkeypatch.setattr(
        mcp_server,
        "verify_token",
        lambda token: TokenPayload(sub="user-1", username="tester"),
    )

    result = await mcp_server.create_persona_preset_tool(
        name="Planner",
        system_prompt="You are a careful planner.",
        description="Plan carefully",
        tags=["planning"],
        skill_names=["planner"],
        ctx=_fake_ctx(),
        manager=_FakeManager(),
    )

    assert result.action == "created"
    assert result.entity_type == "persona_preset"
    assert result.preset.id == "preset-1"


@pytest.mark.asyncio
async def test_update_persona_preset_tool_can_resolve_owned_preset_by_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    updated = _preset(description="Updated description")

    async def _fake_user_resolver(user_id: str):
        assert user_id == "user-1"
        return _fake_user("persona_preset:write")

    class _FakeManager:
        async def list_presets(self, **kwargs):
            assert kwargs["user_id"] == "user-1"
            return [_preset()]

        async def update_preset(self, preset_id, preset_data, *, user_id: str, is_admin: bool):
            assert preset_id == "preset-1"
            assert user_id == "user-1"
            assert is_admin is False
            assert preset_data.description == "Updated description"
            return updated

    monkeypatch.setattr(mcp_server, "resolve_persona_preset_mcp_user", _fake_user_resolver)
    monkeypatch.setattr(
        mcp_server,
        "verify_token",
        lambda token: TokenPayload(sub="user-1", username="tester"),
    )

    result = await mcp_server.update_persona_preset_tool(
        current_name="Planner",
        description="Updated description",
        ctx=_fake_ctx(),
        manager=_FakeManager(),
    )

    assert result.action == "updated"
    assert result.preset.description == "Updated description"


def test_mount_persona_preset_mcp_adds_internal_mount() -> None:
    app = FastAPI()

    mcp_server.mount_persona_preset_mcp(app)

    mounts = [route for route in app.routes if isinstance(route, Mount)]
    assert any(route.path == mcp_server.PERSONA_PRESET_MCP_MOUNT_PATH for route in mounts)


def test_build_persona_preset_mcp_server_config_includes_internal_url_and_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_server.settings, "APP_BASE_URL", "https://chat.example.com")
    monkeypatch.setattr(mcp_server, "create_access_token", lambda user_id: f"token-{user_id}")

    config = mcp_server.build_persona_preset_mcp_server_config("user-1")

    assert config["transport"] == "streamable_http"
    assert config["url"] == (
        "https://chat.example.com"
        f"{mcp_server.PERSONA_PRESET_MCP_MOUNT_PATH}{mcp_server.PERSONA_PRESET_MCP_ENDPOINT_PATH}"
    )
    assert config["headers"]["Authorization"] == "Bearer token-user-1"
