"""Timezone behavior for scheduled_task_create."""

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infra.scheduler.service import ScheduledTaskService as _RealService
from src.infra.tool.scheduled_task import create as create_module
from src.kernel.schemas.scheduled_task import ScheduledTask, ScheduledTaskStatus, TriggerType


class _Runtime:
    def __init__(self, user_id: str | None) -> None:
        context = SimpleNamespace(user_id=user_id) if user_id is not None else None
        self.config = {"configurable": {"context": context}}


async def _call_tool(tool: Any, *args: Any, **kwargs: Any) -> Any:
    return await getattr(tool, "coroutine")(*args, **kwargs)


def _task() -> ScheduledTask:
    return ScheduledTask.model_validate(
        {
            "_id": "task-1",
            "name": "Morning Brief",
            "description": "Test task",
            "agent_id": "fast",
            "trigger_type": TriggerType.CRON,
            "trigger_config": {"hour": "8", "minute": "0"},
            "timezone": "Asia/Shanghai",
            "input_payload": {"message": "Send a morning brief"},
            "status": ScheduledTaskStatus.ACTIVE,
            "enabled": True,
            "owner_id": "user-1",
        }
    )


def _fake_service_cls(**methods: AsyncMock):
    instance = MagicMock()
    for name, mock in methods.items():
        setattr(instance, name, mock)

    class _Fake:
        to_response = _RealService.to_response

        def __new__(cls):
            return instance

    return _Fake


@pytest.mark.asyncio
async def test_create_task_uses_source_session_timezone_for_schedule(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    create_mock = AsyncMock(return_value=_task())
    monkeypatch.setattr(create_module, "_permission_error", AsyncMock(return_value=None))
    monkeypatch.setattr(
        create_module,
        "_confirm_scheduled_task_creation",
        AsyncMock(return_value={"approved": True, "status": "approved", "approval_id": "a-1"}),
    )
    monkeypatch.setattr(
        create_module,
        "_get_current_session_defaults",
        AsyncMock(return_value=("fast", {}, "Asia/Shanghai", None, None, None)),
    )
    monkeypatch.setattr(
        create_module,
        "ScheduledTaskService",
        _fake_service_cls(create_task=create_mock),
    )

    result = json.loads(
        await _call_tool(
            create_module.scheduled_task_create,
            name="Morning Brief",
            message="Send a morning brief",
            trigger_type="cron",
            cron_hour="8",
            cron_minute="0",
            runtime=_Runtime("user-1"),
        )
    )

    request = create_mock.call_args.kwargs["request"]
    assert result["success"] is True
    assert request.timezone == "Asia/Shanghai"
    assert request.input_payload["user_timezone"] == "Asia/Shanghai"
