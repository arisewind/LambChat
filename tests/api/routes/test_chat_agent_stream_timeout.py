from __future__ import annotations

import asyncio

import pytest

from src.api.routes.chat import _execute_agent_stream
from src.kernel.config import settings


class _HangingAgent:
    """Agent whose stream never produces a first event."""

    async def stream(self, *_args, **_kwargs):
        await asyncio.Event().wait()
        yield {}


class _SlowFirstEventAgent:
    """Agent whose first event is slow but subsequent events are unlimited."""

    def __init__(self, first_event_delay: float) -> None:
        self.first_event_delay = first_event_delay

    async def stream(self, *_args, **_kwargs):
        await asyncio.sleep(self.first_event_delay)
        yield {"event": "message:chunk", "data": {"content": "first"}}
        await asyncio.sleep(0.05)
        yield {"event": "message:chunk", "data": {"content": "second"}}


@pytest.mark.asyncio
async def test_execute_agent_stream_raises_timeout_when_no_first_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LLM_FIRST_EVENT_TIMEOUT", 0.05)

    async def _get(_agent_id: str):
        return _HangingAgent()

    monkeypatch.setattr("src.api.routes.chat.AgentFactory.get", _get)

    with pytest.raises(TimeoutError, match="no first event"):
        async for _event in _execute_agent_stream(
            session_id="session-1",
            agent_id="search",
            message="hi",
            user_id="user-1",
        ):
            pass


@pytest.mark.asyncio
async def test_execute_agent_stream_yields_all_events_after_slow_first_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LLM_FIRST_EVENT_TIMEOUT", 1.0)

    async def _get(_agent_id: str):
        return _SlowFirstEventAgent(first_event_delay=0.02)

    monkeypatch.setattr("src.api.routes.chat.AgentFactory.get", _get)

    events = [
        event
        async for event in _execute_agent_stream(
            session_id="session-1",
            agent_id="search",
            message="hi",
            user_id="user-1",
        )
    ]

    assert [event["data"]["content"] for event in events] == ["first", "second"]


@pytest.mark.asyncio
async def test_execute_agent_stream_skips_first_event_timeout_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "LLM_FIRST_EVENT_TIMEOUT", 0.0)

    async def _get(_agent_id: str):
        return _SlowFirstEventAgent(first_event_delay=0.05)

    monkeypatch.setattr("src.api.routes.chat.AgentFactory.get", _get)

    events = [
        event
        async for event in _execute_agent_stream(
            session_id="session-1",
            agent_id="search",
            message="hi",
            user_id="user-1",
        )
    ]

    assert [event["data"]["content"] for event in events] == ["first", "second"]
