from types import SimpleNamespace

import pytest

from src.infra.session.trace_storage import TraceStorage


class _FakeTraceCollection:
    def __init__(self, *, has_usage: bool) -> None:
        self.has_usage = has_usage
        self.calls = []

    async def update_one(self, query, update):
        self.calls.append((query, update))
        if "events.event_type" in query:
            return SimpleNamespace(modified_count=0 if self.has_usage else 1)
        return SimpleNamespace(modified_count=1)


class _FakeTraceCursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self.sort_args = None
        self.skip_value = None
        self.limit_value = None

    def sort(self, *args):
        self.sort_args = args
        return self

    def skip(self, value):
        self.skip_value = value
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    async def to_list(self, length=None):
        docs = self._docs
        if self.skip_value:
            docs = docs[self.skip_value :]
        cap = self.limit_value if self.limit_value is not None else length
        if cap is not None:
            docs = docs[:cap]
        return docs


class _FakeRunSummaryCollection:
    def __init__(self):
        self.find_calls = []
        self.cursor = _FakeTraceCursor(
            [
                {"run_id": "skip-1"},
                {"run_id": "skip-2"},
                {"run_id": "skip-3"},
                {"run_id": "skip-4"},
                {"run_id": "skip-5"},
                {
                    "run_id": "run-1",
                    "trace_id": "trace-1",
                    "agent_id": "agent-1",
                    "started_at": "2026-04-25T00:00:00Z",
                    "completed_at": "2026-04-25T00:01:00Z",
                    "status": "completed",
                    "event_count": 3,
                    "events": [
                        {
                            "event_type": "user:message",
                            "data": {"content": "a message longer than twenty chars"},
                        }
                    ],
                },
            ]
        )

    def find(self, query, projection):
        self.find_calls.append((query, projection))
        return self.cursor


def _usage_event_from_pipeline(update):
    return (
        update[0]["$set"]["events"]["$let"]["vars"].get("usage_event")
        or update[0]["$set"]["events"]["$let"]["in"]["$cond"][1]["$concatArrays"][1][0]
    )


@pytest.mark.asyncio
async def test_complete_trace_adds_zero_token_usage_when_missing() -> None:
    storage = TraceStorage()
    storage._collection = _FakeTraceCollection(has_usage=False)

    assert await storage.complete_trace("trace-1", status="error") is True

    usage_query, usage_update = storage.collection.calls[0]
    assert usage_query == {
        "trace_id": "trace-1",
        "events.event_type": {"$ne": "token:usage"},
    }
    usage_event = _usage_event_from_pipeline(usage_update)
    assert usage_event["event_type"] == "token:usage"
    assert usage_event["data"]["input_tokens"] == 0
    assert usage_event["data"]["output_tokens"] == 0
    assert usage_event["data"]["total_tokens"] == 0
    done_branch = usage_update[0]["$set"]["events"]["$let"]["in"]["$cond"][1]
    assert done_branch["$concatArrays"][1] == [usage_event]


@pytest.mark.asyncio
async def test_complete_trace_does_not_duplicate_existing_token_usage() -> None:
    storage = TraceStorage()
    storage._collection = _FakeTraceCollection(has_usage=True)

    assert await storage.complete_trace("trace-1", status="completed") is True

    assert len(storage.collection.calls) == 2
    usage_update = storage.collection.calls[0][1]
    assert _usage_event_from_pipeline(usage_update)["event_type"] == "token:usage"
    assert storage.collection.calls[1][0] == {"trace_id": "trace-1"}


@pytest.mark.asyncio
async def test_complete_trace_can_skip_zero_token_usage_placeholder() -> None:
    storage = TraceStorage()
    storage._collection = _FakeTraceCollection(has_usage=False)

    assert await storage.complete_trace("trace-1", status="error", ensure_token_usage=False) is True

    assert len(storage.collection.calls) == 1
    assert storage.collection.calls[0][0] == {"trace_id": "trace-1"}


@pytest.mark.asyncio
async def test_list_run_summaries_projects_first_user_message_only() -> None:
    storage = TraceStorage()
    storage._collection = _FakeRunSummaryCollection()

    summaries = await storage.list_run_summaries("session-1", limit=10, skip=5)

    assert summaries == [
        {
            "run_id": "run-1",
            "trace_id": "trace-1",
            "agent_id": "agent-1",
            "started_at": "2026-04-25T00:00:00Z",
            "completed_at": "2026-04-25T00:01:00Z",
            "status": "completed",
            "event_count": 3,
            "user_message": "a message longer ...",
        }
    ]
    assert storage.collection.find_calls == [
        (
            {"session_id": "session-1"},
            {
                "_id": 0,
                "run_id": 1,
                "trace_id": 1,
                "agent_id": 1,
                "started_at": 1,
                "completed_at": 1,
                "status": 1,
                "event_count": 1,
                "events": {"$elemMatch": {"event_type": "user:message"}},
            },
        )
    ]
    assert storage.collection.cursor.sort_args == ("started_at", -1)
    assert storage.collection.cursor.skip_value == 5
    assert storage.collection.cursor.limit_value == 10
