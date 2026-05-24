from __future__ import annotations

import pytest

from src.infra.tool import mcp_pool


class _FakeClient:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1


@pytest.fixture(autouse=True)
async def _reset_pool_state() -> None:
    await mcp_pool.close_all_connections()
    mcp_pool._cleanup_counter = 0
    yield
    await mcp_pool.close_all_connections()
    mcp_pool._cleanup_counter = 0


@pytest.mark.asyncio
async def test_mcp_pool_eviction_closes_oldest_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(mcp_pool, "MAX_CONNECTIONS", 2)
    first = _FakeClient()
    second = _FakeClient()
    third = _FakeClient()

    await mcp_pool.add_pooled_connection("first", {"url": "1"}, first, [])
    await mcp_pool.add_pooled_connection("second", {"url": "2"}, second, [])
    await mcp_pool.add_pooled_connection("third", {"url": "3"}, third, [])

    stats = await mcp_pool.get_pool_stats()

    assert stats["total_connections"] == 2
    assert first.close_calls == 1
    assert second.close_calls == 0
    assert third.close_calls == 0


@pytest.mark.asyncio
async def test_mcp_pool_close_all_connections_closes_and_clears_pool() -> None:
    first = _FakeClient()
    second = _FakeClient()

    await mcp_pool.add_pooled_connection("first", {"url": "1"}, first, [])
    await mcp_pool.add_pooled_connection("second", {"url": "2"}, second, [])

    await mcp_pool.close_all_connections()

    assert first.close_calls == 1
    assert second.close_calls == 1
    assert (await mcp_pool.get_pool_stats())["total_connections"] == 0
