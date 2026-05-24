from __future__ import annotations

import pytest

from src.infra.task.heartbeat import TaskHeartbeat


class _FakeRedisClient:
    def __init__(self) -> None:
        self.set_calls = 0
        self.deleted: list[str] = []

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.set_calls += 1
        if self.set_calls >= 2:
            raise RuntimeError("heartbeat failed")
        return True

    async def delete(self, key: str) -> int:
        self.deleted.append(key)
        return 1


@pytest.mark.asyncio
async def test_heartbeat_task_cleans_itself_up_when_it_exits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedisClient()
    monkeypatch.setattr(
        "src.infra.task.heartbeat.get_redis_client",
        lambda: fake_redis,
    )

    async def _sleep(_: float) -> None:
        return None

    monkeypatch.setattr("src.infra.task.heartbeat.asyncio.sleep", _sleep)

    heartbeat = TaskHeartbeat()
    await heartbeat.start("run-1", user_id="user-1")

    task = heartbeat._heartbeat_tasks["run-1"]
    await task

    assert "run-1" not in heartbeat._heartbeat_tasks
