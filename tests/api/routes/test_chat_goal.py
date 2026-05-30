from __future__ import annotations

import pytest

from src.api.routes.chat import (
    _execute_agent_stream,
    build_conversation_config,
    resolve_goal_for_request,
)
from src.kernel.schemas.agent import AgentRequest, GoalSpec


def test_build_conversation_config_does_not_persist_run_scoped_goal() -> None:
    request = AgentRequest(
        message="continue",
        goal=GoalSpec(objective="finish exports", rubric="- exports work"),
    )

    config = build_conversation_config(
        run_id="run-1",
        agent_id="search",
        request=request,
        language="en",
        session_id="session-1",
    )

    assert "active_goal" not in config


def test_resolve_goal_for_request_uses_request_goal_without_rewriting_message() -> None:
    request = AgentRequest(
        message="continue",
        goal=GoalSpec(objective="finish docs", rubric="- docs finished"),
    )

    active_goal, agent_message = resolve_goal_for_request(request, existing_metadata={})

    assert active_goal is not None
    assert active_goal.objective == "finish docs"
    assert agent_message == "continue"
    assert request.goal == active_goal
    assert "goal_command_action" not in request.context


def test_resolve_goal_for_request_does_not_restore_session_goal_for_follow_up() -> None:
    request = AgentRequest(message="keep going")

    active_goal, agent_message = resolve_goal_for_request(
        request,
        existing_metadata={
            "active_goal": {
                "objective": "finish docs",
                "rubric": "- docs are updated",
                "max_iterations": 5,
            }
        },
    )

    assert active_goal is None
    assert agent_message == "keep going"
    assert request.goal is None


@pytest.mark.asyncio
async def test_execute_agent_stream_runs_agent_when_active_goal_is_supplied(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Presenter:
        run_id = "run-1"
        trace_id = "trace-1"

        def metadata(self):
            return {"event": "metadata", "data": {"run_id": self.run_id}}

    class _Agent:
        def __init__(self) -> None:
            self.stream_kwargs = None

        async def stream(self, *args, **kwargs):
            self.stream_kwargs = kwargs
            yield {"event": "message:chunk", "data": {"content": "ok"}}

    agent = _Agent()

    async def _get(_agent_id: str):
        return agent

    monkeypatch.setattr("src.api.routes.chat.AgentFactory.get", _get)

    events = [
        event
        async for event in _execute_agent_stream(
            session_id="session-1",
            agent_id="search",
            message="hi",
            user_id="user-1",
            presenter=_Presenter(),
            active_goal={"objective": "hi", "rubric": "- say hi"},
        )
    ]

    assert [event["event"] for event in events] == [
        "goal:start",
        "message:chunk",
        "goal:end",
    ]
    assert events[0]["data"]["goal"] == {"objective": "hi", "rubric": "- say hi"}
    assert events[0]["data"]["started_at"]
    assert events[2]["data"]["goal"] == {"objective": "hi", "rubric": "- say hi"}
    assert events[2]["data"]["ended_at"]
    assert agent.stream_kwargs["active_goal"] == {"objective": "hi", "rubric": "- say hi"}
