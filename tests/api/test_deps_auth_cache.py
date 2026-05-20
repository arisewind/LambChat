from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from src.api import deps
from src.kernel.schemas.user import TokenPayload, UserInDB


class _UserStorage:
    async def get_by_id(self, user_id: str) -> UserInDB | None:
        assert user_id == "user-1"
        return UserInDB(
            id="user-1",
            username="from-storage",
            email="user@example.com",
            password_hash="hash",
            roles=["user"],
            is_active=True,
            email_verified=True,
        )


async def _fake_roles(_roles: list[str]) -> tuple[list[str], list[str]]:
    return ["user"], ["chat:write"]


@pytest.mark.asyncio
async def test_get_current_user_required_reuses_request_state_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = {"verify": 0}

    def fail_verify(_token: str) -> TokenPayload:
        calls["verify"] += 1
        raise AssertionError("verify_token should not run when middleware already parsed auth")

    monkeypatch.setattr(deps, "verify_token", fail_verify)
    monkeypatch.setattr(deps, "UserStorage", lambda: _UserStorage())
    monkeypatch.setattr(deps, "_get_user_roles_and_permissions", _fake_roles)

    request = SimpleNamespace(
        state=SimpleNamespace(
            auth_payload=TokenPayload(sub="user-1", username="from-token"),
        )
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

    user = await deps.get_current_user_required(request, credentials)

    assert user.username == "from-storage"
    assert calls["verify"] == 0
