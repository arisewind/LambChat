import logging

import pytest

from src.api import main as api_main


@pytest.mark.asyncio
async def test_agent_discovery_warmup_logs_traceback_on_failure(
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _raise_from_blocking_io(_func):
        raise SystemError("bad argument to internal function")

    monkeypatch.setattr(api_main, "run_blocking_io", _raise_from_blocking_io)

    with caplog.at_level(logging.WARNING, logger="src.api.main"):
        await api_main._warm_agent_registry()

    record = next(
        record
        for record in caplog.records
        if record.message.startswith("Agent discovery warm-up failed:")
    )
    assert record.exc_info is not None
