from __future__ import annotations

import asyncio
import threading

import pytest

from src.infra.async_utils.blocking import run_blocking_io


@pytest.mark.asyncio
async def test_run_blocking_io_runs_callable_away_from_event_loop_thread() -> None:
    loop_thread = threading.get_ident()

    def blocking_call(value: str, *, suffix: str) -> tuple[str, int]:
        return f"{value}{suffix}", threading.get_ident()

    result, worker_thread = await run_blocking_io(blocking_call, "ok", suffix="-done")

    assert result == "ok-done"
    assert worker_thread != loop_thread


@pytest.mark.asyncio
async def test_run_blocking_io_applies_timeout() -> None:
    def slow_call() -> None:
        import time

        time.sleep(0.2)

    with pytest.raises(asyncio.TimeoutError):
        await run_blocking_io(slow_call, timeout=0.01)
