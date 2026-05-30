"""Tests for rubric grader event handling in AgentEventProcessor."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infra.agent.events.processor import RUBRIC_GRADER, AgentEventProcessor
from src.infra.writer.present import Presenter


def _make_processor(emitted: list[dict]) -> AgentEventProcessor:
    """Create a processor with a mock presenter that collects emitted events."""
    presenter = MagicMock(spec=Presenter)
    presenter.emit = AsyncMock(side_effect=lambda e: emitted.append(e))
    presenter.present_agent_call = MagicMock(
        side_effect=lambda **kw: {"event": "agent:call", "data": kw}
    )
    presenter.present_agent_result = MagicMock(
        side_effect=lambda **kw: {"event": "agent:result", "data": kw}
    )
    return AgentEventProcessor(presenter)


def _chain_start_event(
    name: str = RUBRIC_GRADER,
    run_id: str = "test-run-id-12345678",
) -> dict[str, Any]:
    return {
        "event": "on_chain_start",
        "name": name,
        "run_id": run_id,
        "data": {"input": {}},
        "metadata": {},
    }


def _chain_end_event(
    name: str = RUBRIC_GRADER,
    run_id: str = "test-run-id-12345678",
    structured_response: dict | None = None,
) -> dict[str, Any]:
    output: dict[str, Any] = {"messages": []}
    if structured_response is not None:
        output["structured_response"] = structured_response
    return {
        "event": "on_chain_end",
        "name": name,
        "run_id": run_id,
        "data": {"output": output, "input": {}},
        "metadata": {},
    }


def _chat_model_stream_event(content: str = "thinking...") -> dict[str, Any]:
    return {
        "event": "on_chat_model_stream",
        "name": "ChatAnthropic",
        "run_id": "model-run-id",
        "data": {"chunk": MagicMock(content=content, id="chunk-1")},
        "metadata": {},
    }


def _chat_model_end_event() -> dict[str, Any]:
    return {
        "event": "on_chat_model_end",
        "name": "ChatAnthropic",
        "run_id": "model-run-id",
        "data": {"output": MagicMock()},
        "metadata": {},
    }


@pytest.fixture()
def emitted():
    return []


@pytest.fixture()
def processor(emitted):
    return _make_processor(emitted)


class TestRubricGraderChainStart:
    async def test_emits_agent_call_on_chain_start(self, processor, emitted):
        event = _chain_start_event()
        await processor.process_event(event)

        assert len(emitted) == 1
        assert emitted[0]["event"] == "agent:call"
        assert emitted[0]["data"]["agent_id"] == "rubric_grader_test-run"
        assert emitted[0]["data"]["depth"] == 1
        assert emitted[0]["data"]["agent_name"] == "Rubric Grader"

    async def test_sets_active_flag(self, processor):
        await processor.process_event(_chain_start_event())
        assert processor._rubric_grader_active is True
        assert processor._rubric_grader_id == "rubric_grader_test-run"


class TestRubricGraderChainEnd:
    async def test_emits_agent_result_on_chain_end(self, processor, emitted):
        await processor.process_event(_chain_start_event())
        emitted.clear()

        sr = {"result": "satisfied", "explanation": "All criteria passed."}
        await processor.process_event(_chain_end_event(structured_response=sr))

        assert len(emitted) == 1
        assert emitted[0]["event"] == "agent:result"
        assert emitted[0]["data"]["agent_id"] == "rubric_grader_test-run"
        assert emitted[0]["data"]["depth"] == 1
        assert "satisfied" in emitted[0]["data"]["result"]
        assert "All criteria passed" in emitted[0]["data"]["result"]

    async def test_needs_revision_shows_as_success(self, processor, emitted):
        await processor.process_event(_chain_start_event())
        emitted.clear()

        sr = {"result": "needs_revision", "explanation": "Missing tests."}
        await processor.process_event(_chain_end_event(structured_response=sr))

        assert emitted[0]["data"]["success"] is True
        assert "needs_revision" in emitted[0]["data"]["result"]

    async def test_failed_shows_as_not_success(self, processor, emitted):
        await processor.process_event(_chain_start_event())
        emitted.clear()

        sr = {"result": "failed", "explanation": "Malformed rubric."}
        await processor.process_event(_chain_end_event(structured_response=sr))

        assert emitted[0]["data"]["success"] is False

    async def test_no_structured_response_graceful_fallback(self, processor, emitted):
        await processor.process_event(_chain_start_event())
        emitted.clear()

        await processor.process_event(_chain_end_event(structured_response=None))

        assert len(emitted) == 1
        assert emitted[0]["data"]["result"] == "completed"

    async def test_clears_active_flag(self, processor):
        await processor.process_event(_chain_start_event())
        assert processor._rubric_grader_active is True

        await processor.process_event(_chain_end_event())
        assert processor._rubric_grader_active is False
        assert processor._rubric_grader_id is None


class TestRubricGraderEventRouting:
    """Rubric grader internal events are routed as sub-agent content (depth=1)
    instead of being suppressed, so the frontend can display them in the
    SubagentBlock panel."""

    async def test_routes_chat_model_stream_inside_grader(self, processor, emitted):
        await processor.process_event(_chain_start_event())
        emitted.clear()

        # Text streaming inside the grader should be routed with depth=1
        # Content is buffered (flush size = 200), so no emit yet for small chunks
        await processor.process_event(_chat_model_stream_event("Let me evaluate..."))

        # Content should NOT appear in the main output buffer (depth=1, only depth=0 goes there)
        # and should NOT be suppressed (the event was processed, not dropped)
        # Since flush size is 200, a short chunk won't emit yet — that's expected
        assert len(emitted) == 0  # buffered, not yet emitted

    async def test_counts_token_usage_inside_grader(self, processor):
        await processor.process_event(_chain_start_event())

        # Token usage from grader's model calls should be counted
        mock_output = MagicMock()
        mock_output.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
        event = _chat_model_end_event()
        event["data"]["output"] = mock_output
        await processor.process_event(event)
        # model-end handler was called (no longer suppressed)
        assert processor.total_input_tokens == 100

    async def test_routes_tool_events_inside_grader(self, processor, emitted):
        await processor.process_event(_chain_start_event())
        emitted.clear()

        tool_event = {
            "event": "on_tool_start",
            "name": "GraderResponse",
            "run_id": "tool-run-id",
            "data": {"input": {}},
            "metadata": {},
        }
        await processor.process_event(tool_event)
        # Tool event should be routed (emitted), not suppressed
        assert len(emitted) >= 1

    async def test_events_flow_normally_after_grader_ends(self, processor, emitted):
        # Start grader
        await processor.process_event(_chain_start_event())
        # Route some events through the grader
        await processor.process_event(_chat_model_stream_event("thinking"))
        # End grader
        await processor.process_event(_chain_end_event())
        # Clear the output buffer from grader events
        emitted.clear()

        # Now a regular chat stream should be processed normally
        # (it will try to buffer and flush, but no emit since buffer < flush size)
        await processor.process_event(
            {
                "event": "on_chat_model_stream",
                "name": "ChatAnthropic",
                "run_id": "main-run-id",
                "data": {"chunk": MagicMock(content="Hello", id="main-chunk-1")},
                "metadata": {},
            }
        )
        # Event was processed — content should be in output buffer
        assert "Hello" in processor.output_text


class TestRubricGraderEdgeCases:
    async def test_non_rubric_chain_start_not_affected(self, processor, emitted):
        """A regular chain start (not rubric_grader) should not be captured."""
        event = _chain_start_event(name="some_other_chain")
        await processor.process_event(event)
        assert len(emitted) == 0
        assert processor._rubric_grader_active is False

    async def test_non_rubric_chain_end_not_affected(self, processor, emitted):
        """A regular chain end (not rubric_grader) should not be captured."""
        event = _chain_end_event(name="some_other_chain")
        await processor.process_event(event)
        assert len(emitted) == 0

    async def test_multiple_grader_iterations(self, processor, emitted):
        """Multiple grading rounds should each get their own call/result pair."""
        # Iteration 1
        await processor.process_event(_chain_start_event(run_id="run-11111111"))
        await processor.process_event(_chat_model_stream_event("thinking 1"))
        await processor.process_event(
            _chain_end_event(
                run_id="run-11111111",
                structured_response={"result": "needs_revision", "explanation": "Try again."},
            )
        )
        # Iteration 2
        await processor.process_event(_chain_start_event(run_id="run-22222222"))
        await processor.process_event(_chat_model_stream_event("thinking 2"))
        await processor.process_event(
            _chain_end_event(
                run_id="run-22222222",
                structured_response={"result": "satisfied", "explanation": "All good."},
            )
        )

        call_events = [e for e in emitted if e["event"] == "agent:call"]
        result_events = [e for e in emitted if e["event"] == "agent:result"]
        assert len(call_events) == 2
        assert len(result_events) == 2
        assert call_events[0]["data"]["agent_id"] == "rubric_grader_run-1111"
        assert call_events[1]["data"]["agent_id"] == "rubric_grader_run-2222"

        assert "satisfied" in result_events[1]["data"]["result"]
