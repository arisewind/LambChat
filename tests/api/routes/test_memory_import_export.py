from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest

from src.api.routes import memory as memory_routes
from src.kernel.schemas.user import TokenPayload


def _user() -> TokenPayload:
    return TokenPayload(sub="user-1", username="tester", roles=["user"])


class _AsyncCursor:
    def __init__(self, docs: list[dict[str, Any]]):
        self._docs = docs

    def __aiter__(self):
        return self._iter()

    async def _iter(self):
        for doc in self._docs:
            yield doc


class _FakeStore:
    def __init__(self, values: dict[tuple[tuple[str, ...], str], dict[str, Any]] | None = None):
        self.values = values or {}

    async def aget(self, namespace: tuple[str, ...], key: str) -> Any:
        value = self.values.get((namespace, key))
        if value is None:
            return None
        return SimpleNamespace(value=value)

    async def aput(
        self, namespace: tuple[str, ...], key: str, value: dict[str, Any] | None
    ) -> None:
        if value is None:
            self.values.pop((namespace, key), None)
            return
        self.values[(namespace, key)] = value


class _FakeCollection:
    def __init__(self, docs: list[dict[str, Any]]):
        self.docs = docs

    def find(self, query: dict[str, Any], projection: dict[str, int] | None = None) -> _AsyncCursor:
        docs = []
        for doc in self.docs:
            if doc.get("user_id") == query.get("user_id"):
                docs.append(dict(doc))
        return _AsyncCursor(docs)

    async def find_one(
        self, query: dict[str, Any], projection: dict[str, int] | None = None
    ) -> dict[str, Any] | None:
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                return dict(doc)
        return None

    async def replace_one(
        self, query: dict[str, Any], replacement: dict[str, Any], upsert: bool = False
    ) -> SimpleNamespace:
        for index, doc in enumerate(self.docs):
            if all(doc.get(key) == value for key, value in query.items()):
                self.docs[index] = dict(replacement)
                return SimpleNamespace(matched_count=1, upserted_id=None)
        if upsert:
            self.docs.append(dict(replacement))
            return SimpleNamespace(matched_count=0, upserted_id="inserted")
        return SimpleNamespace(matched_count=0, upserted_id=None)


class _FakeBackend:
    def __init__(self, docs: list[dict[str, Any]], store: _FakeStore | None = None):
        self._collection = _FakeCollection(docs)
        self._store = store or _FakeStore()
        self.invalidated_users: list[str] = []

    async def _maybe_embed(self, text: str) -> None:
        return None

    async def _invalidate_cache(self, user_id: str) -> None:
        self.invalidated_users.append(user_id)


@pytest.mark.asyncio
async def test_export_memories_includes_hydrated_full_content(monkeypatch: pytest.MonkeyPatch):
    store = _FakeStore(
        {
            (("memories", "user-1", "content"), "memory:stored-1"): {
                "text": "full stored memory text",
                "memory_id": "stored-1",
            }
        }
    )
    backend = _FakeBackend(
        [
            {
                "memory_id": "stored-1",
                "user_id": "user-1",
                "title": "Stored",
                "summary": "Stored summary",
                "memory_type": "user",
                "tags": ["alpha"],
                "content": "full stored...",
                "content_storage_mode": "store",
                "content_store_key": "memory:stored-1",
                "context": "ctx",
                "source": "manual",
                "created_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 1, 3, tzinfo=timezone.utc),
                "access_count": 7,
            },
            {
                "memory_id": "other-user",
                "user_id": "user-2",
                "title": "Hidden",
                "summary": "Hidden",
                "memory_type": "user",
                "tags": [],
                "content": "nope",
            },
        ],
        store,
    )

    async def fake_get_backend() -> _FakeBackend:
        return backend

    monkeypatch.setattr(memory_routes, "_get_backend", fake_get_backend)

    result = await memory_routes.export_memories(user=_user())

    assert result["version"] == 1
    assert len(result["memories"]) == 1
    assert result["memories"][0]["memory_id"] == "stored-1"
    assert result["memories"][0]["content"] == "full stored memory text"
    assert "user_id" not in result["memories"][0]


@pytest.mark.asyncio
async def test_import_memories_overwrites_matching_memory_id(monkeypatch: pytest.MonkeyPatch):
    backend = _FakeBackend(
        [
            {
                "memory_id": "same-id",
                "user_id": "user-1",
                "title": "Old",
                "summary": "Old summary",
                "memory_type": "user",
                "tags": ["old"],
                "content": "old content",
                "content_storage_mode": "inline",
                "content_store_key": None,
                "source": "manual",
            }
        ]
    )

    async def fake_get_backend() -> _FakeBackend:
        return backend

    monkeypatch.setattr(memory_routes, "_get_backend", fake_get_backend)

    result = await memory_routes.import_memories(
        {
            "version": 1,
            "memories": [
                {
                    "memory_id": "same-id",
                    "title": "New",
                    "summary": "New summary",
                    "memory_type": "project",
                    "tags": ["new"],
                    "content": "new content",
                    "context": "project ctx",
                    "source": "backup",
                    "created_at": "2026-01-02T00:00:00+00:00",
                    "updated_at": "2026-01-03T00:00:00+00:00",
                    "access_count": 3,
                },
                {
                    "memory_id": "fresh-id",
                    "title": "Fresh",
                    "summary": "Fresh summary",
                    "memory_type": "reference",
                    "tags": [],
                    "content": "fresh content",
                },
            ],
        },
        user=_user(),
    )

    assert result == {"success": True, "imported": 2, "created": 1, "overwritten": 1}
    docs = {doc["memory_id"]: doc for doc in backend._collection.docs}
    assert docs["same-id"]["user_id"] == "user-1"
    assert docs["same-id"]["title"] == "New"
    assert docs["same-id"]["memory_type"] == "project"
    assert docs["same-id"]["content"] == "new content"
    assert docs["fresh-id"]["user_id"] == "user-1"
    assert backend.invalidated_users == ["user-1"]
