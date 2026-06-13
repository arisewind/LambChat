from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.middleware.auth import AuthMiddleware


@pytest.mark.asyncio
async def test_vapid_public_key_path_is_public_without_authorization() -> None:
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.get("/api/push/vapid-public-key")
    async def vapid_public_key() -> dict[str, str]:
        return {"public_key": "test-key"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/push/vapid-public-key")

    assert response.status_code == 200
    assert response.json() == {"public_key": "test-key"}
