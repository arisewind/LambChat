# 系统中断后同 run_id 无感续跑（Seamless Run Resume）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端中断（重启/部署/进程死亡）后，自动恢复时复用原 run_id 与 trace，不产生新 run 消息、不写可见恢复提示，前端原气泡清空重生成，用户无感。

**Architecture:** 复用 HITL 恢复已验证的「同 run_id 续跑」机制（`hitl.py` 模板）：恢复提交时传 `run_id=source_run_id, trace_id=source_trace_id, message=<隐藏指令>, user_message_written=True`。三处关键变化：(1) 优雅关停时 executor 的取消路径不再写终态事件/终结 trace（用 interrupt 标志区分用户取消与系统中断）；(2) 恢复流程改为无缝提交 + 重开被旧代码终结的 trace + 清理流内残留终态事件 + 恢复次数上限防循环；(3) 前端处理新增 `run:resumed` 事件，清空原气泡的半截内容后继续接收。节点层（fast/search/team agent）无需改动——隐藏指令作为普通 HumanMessage 走既有路径（checkpoint 历史在，不会重放全对话）。

**Tech Stack:** Python 3.12 / FastAPI / LangGraph checkpointer（Mongo）/ Redis Stream / arq；React 19 + TS / Vitest。

**Spec:** 本文件 + 会话中确认的设计（2026-09-01）。

## Global Constraints

- 遵循 `AGENTS.md`：后端用 `uv`、前端用 `pnpm`；TDD（先红后绿）；`make lint`/`make typecheck`/`make format` 通过；路由层禁止 `raise HTTPException`；提交信息 `类型(范围): 中文摘要`。
- 「系统中断」的判定依据：取消发生时 `TaskCancellation.check_interrupt_fast(run_id)` 为 False（用户取消总是先设标志再 cancel，见 `cancellation.py:102` 与 pubsub 同步）。
- SSE 读循环遇 `done`/`complete`/`error` 事件即断开（`dual_writer._should_stop_stream_on_event`），因此中断时刻流内不得残留终态事件。
- trace status="running" 是历史读取「活跃 run」判定条件（`trace_storage.py:756-767`），恢复前必须保证 trace 处于 running（或不存在）。
- 恢复次数上限 3 次，超限后落回不可恢复的 FAILED 终态（写 error 事件），防止毒消息无限重跑烧 token。
- 前端 run:resumed 语义：清空该 assistant 气泡的内容型状态（parts/content/toolCalls 等），回到 streaming 空气泡，后续事件重新填充。

---

### Task 1: Executor 中断分支（取消时不写终态事件）+ `run:resumed` 标记事件

**Files:**
- Modify: `src/infra/task/executor.py`
- Test: `tests/infra/task/test_executor_interrupted_resume.py`（新建）

**Interfaces:**
- Produces: `TaskExecutor.run_task(..., interrupted_resume: bool = False)`；新 SSE 事件类型 `run:resumed`（data: `{run_id, trace_id, reason, timestamp}`）。

- [ ] **Step 1: 写失败测试**

```python
# tests/infra/task/test_executor_interrupted_resume.py
"""系统中断（非用户取消）时 executor 不得写终态事件；恢复 run 先发 run:resumed。"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.infra.task import executor as executor_mod
from src.infra.task.status import TaskStatus


def _make_executor() -> tuple[executor_mod.TaskExecutor, dict]:
    storage = MagicMock()
    storage.update = AsyncMock()
    run_info: dict = {}
    heartbeat = MagicMock()
    heartbeat.start = AsyncMock()
    heartbeat.stop = AsyncMock()
    ex = executor_mod.TaskExecutor(storage, run_info, heartbeat)
    return ex, run_info


def _make_presenter() -> MagicMock:
    presenter = MagicMock()
    presenter.trace_id = "trace-1"
    presenter.run_id = "run-1"
    presenter.save_event = AsyncMock()
    presenter.complete = AsyncMock()
    presenter.emit_user_message = AsyncMock()
    presenter.done = MagicMock(return_value={"event": "done", "data": {}})
    presenter._ensure_token_usage_event = AsyncMock()
    return presenter


async def _cancel_mid_stream(executor_fn):
    """执行到 agent 流中途抛 CancelledError 的 executor。"""

    async def gen(*args, **kwargs):
        yield {"event": "thinking", "data": {"content": "部分输出"}}
        raise asyncio.CancelledError()

    return gen


@pytest.mark.parametrize("patch_presenter", [True])
async def test_shutdown_cancel_writes_no_terminal_events(patch_presenter):
    """无 interrupt 标志的取消（系统关停）不写 error/done/user:cancel、不终结 trace。"""
    ex, run_info = _make_executor()
    presenter = _make_presenter()

    async def _run():
        with (
            patch("src.infra.writer.present.Presenter", return_value=presenter),
            patch.object(executor_mod, "get_dual_writer") as gw,
        ):
            dw = gw.return_value
            dw.write_event = AsyncMock()
            dw._flush_redis_buffer = AsyncMock()
            dw.flush_mongo_buffer = AsyncMock()
            dw.expire_stream = AsyncMock()
            await ex.run_task(
                "sess-1",
                "run-1",
                "fast",
                "hi",
                "user-1",
                executor=await _cancel_mid_stream(None),
                user_message_written=True,
            )

    with patch(
        "src.infra.task.cancellation.TaskCancellation.check_interrupt_fast", return_value=False
    ):
        with pytest.raises(asyncio.CancelledError):
            await _run()

    presenter.complete.assert_not_awaited()
    dw.write_event.assert_not_awaited()
    dw.expire_stream.assert_not_awaited()


async def test_user_cancel_still_writes_terminal_events():
    """用户取消（interrupt 标志在）保持旧行为：写终态事件。"""
    ex, run_info = _make_executor()
    presenter = _make_presenter()

    async def _run():
        with (
            patch("src.infra.writer.present.Presenter", return_value=presenter),
            patch.object(executor_mod, "get_dual_writer") as gw,
        ):
            dw = gw.return_value
            dw.write_event = AsyncMock()
            dw._flush_redis_buffer = AsyncMock()
            dw.flush_mongo_buffer = AsyncMock()
            dw.expire_stream = AsyncMock()
            await ex.run_task(
                "sess-1",
                "run-1",
                "fast",
                "hi",
                "user-1",
                executor=await _cancel_mid_stream(None),
                user_message_written=True,
            )

    with patch(
        "src.infra.task.cancellation.TaskCancellation.check_interrupt_fast", return_value=True
    ):
        with pytest.raises(asyncio.CancelledError):
            await _run()

    presenter.complete.assert_awaited_with("error")
    assert dw.write_event.await_count >= 1  # user:cancel / error 终态事件


async def test_interrupted_resume_emits_run_resumed_first():
    """interrupted_resume=True 时，agent 输出前先落 run:resumed 事件。"""
    ex, run_info = _make_executor()
    presenter = _make_presenter()

    async def gen(*args, **kwargs):
        yield {"event": "message:chunk", "data": {"content": "重生成"}}

    async def _run():
        with (
            patch("src.infra.writer.present.Presenter", return_value=presenter),
            patch.object(executor_mod, "get_dual_writer"),
        ):
            return await ex.run_task(
                "sess-1",
                "run-1",
                "fast",
                "继续",
                "user-1",
                executor=gen,
                user_message_written=True,
                interrupted_resume=True,
            )

    with patch("src.infra.task.cancellation.TaskCancellation.clear_interrupt", new=AsyncMock()):
        await _run()
    first = presenter.save_event.await_args_list[0]
    assert first.args[0]["event"] == "run:resumed"
    assert first.args[0]["data"]["run_id"] == "run-1"
```

- [ ] **Step 2: 运行确认失败**：`uv run pytest tests/infra/task/test_executor_interrupted_resume.py -v` → FAIL（TypeError: unexpected keyword 'interrupted_resume' / 断言失败）

- [ ] **Step 3: 最小实现**

`src/infra/task/executor.py`：

```python
# run_task 签名追加（在 hitl_resume 参数后）：
        interrupted_resume: bool = False,
# 常量（模块顶部）：
_MAX_SEAMLESS_RESUME_REASONS = ...  # 不需要，见 Task 3

# run_task 内、emit user:message 块之后（hitl_resume 块之前）：
            if interrupted_resume:
                await presenter.save_event(
                    {
                        "event": "run:resumed",
                        "data": {
                            "run_id": run_id,
                            "trace_id": presenter.trace_id,
                            "timestamp": utc_now_iso(),
                        },
                    }
                )

# _handle_cancelled_error 开头加分支：
        from .cancellation import TaskCancellation

        if not TaskCancellation.check_interrupt_fast(run_id):
            # 系统中断（优雅关停/部署）：不写终态事件、不终结 trace、
            # 不过期 stream；由 manager.shutdown / arq_worker 标记 recoverable。
            if dual_writer is None:
                dual_writer = get_dual_writer()
            try:
                await dual_writer._flush_redis_buffer()
                await dual_writer.flush_mongo_buffer()
            except Exception as e:
                logger.warning("Failed to flush events on system interruption: %s", e)
            logger.info(
                "Task interrupted by system shutdown (resumable): session=%s, run_id=%s",
                session_id, run_id,
            )
            return
        # ……以下原用户取消逻辑不变
```

注意：模块顶部已 import `TaskCancellation` 的位置在 run_task 的 finally 里是局部 import——把 `from .cancellation import TaskCancellation` 提到模块顶部，原 finally 里的局部 import 删除。

- [ ] **Step 4: 跑测试通过**：同 Step 2 命令，全部 PASS（含既有 `test_manager_cancel_terminal.py`、`test_executor_*` 不回归）

- [ ] **Step 5: Commit**: `git add -A && git commit -m "feat(task): executor 系统中断不再写终态事件并支持 run:resumed 标记"`

---

### Task 2: Trace 重开 + Redis Stream 残留终态事件清理

**Files:**
- Modify: `src/infra/session/trace_storage_writes.py`（`reopen_interrupted_trace`）
- Modify: `src/infra/session/trace_storage.py`（若有方法表/类型声明需同步）
- Modify: `src/infra/task/recovery.py`（`_strip_terminal_stream_events`）
- Test: `tests/infra/session/test_trace_reopen.py`（新建）、`tests/infra/task/test_recovery_stream_strip.py`（新建）

**Interfaces:**
- Produces: `TraceStorage.reopen_interrupted_trace(trace_id: str) -> bool`（仅当 status=="error" 时置回 "running" 并清 completed_at；永不触碰 completed trace）
- Produces: `TaskRecoveryService._strip_terminal_stream_events(session_id: str, run_id: str) -> int`（xdel 流内 error/done/complete 事件，返回删除数）

- [ ] **Step 1: 失败测试**

```python
# tests/infra/session/test_trace_reopen.py
async def test_reopen_interrupted_trace_resets_error_status(collection_with_trace):
    # status="error" 的 trace 可重开；status="completed" 的不可动
    ...


# tests/infra/task/test_recovery_stream_strip.py
async def test_strip_terminal_stream_events_removes_terminal_only(fake_redis_stream):
    # 流里 [thinking, error, done, message:chunk] → 删掉 error/done，保留其余
    ...
```

（fixture 按仓库现有 Mongo mock 模式写，参考 `tests/infra/task/test_recovery_error_event.py` 与 `tests/infra/session/` 现有测试。）

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现**

```python
# trace_storage_writes.py（TraceStorageWriteMixin 内，complete_trace 之后）
    async def reopen_interrupted_trace(self, trace_id: str) -> bool:
        """Reopen an error-finalized trace so a seamless resume can append events.

        Completed traces are never touched; only ``status == "error"`` documents
        (written by the pre-seamless shutdown path or races) are reset to running.
        """
        try:
            result = await self.collection.update_one(
                {"trace_id": trace_id, "status": "error"},
                {
                    "$set": {"status": "running", "updated_at": utc_now()},
                    "$unset": {"completed_at": ""},
                },
            )
            if result.modified_count:
                logger.info("Reopened interrupted trace %s for seamless resume", trace_id)
            return result.modified_count > 0
        except Exception as e:
            logger.warning("Failed to reopen trace %s: %s", trace_id, e)
            return False
```

```python
# recovery.py（TaskRecoveryService 内）
    async def _strip_terminal_stream_events(self, session_id: str, run_id: str) -> int:
        """删除 Redis Stream 中残留的终态事件，恢复后 SSE 重放才不会提前断开。"""
        from src.infra.session.dual_writer import get_dual_writer

        removed = 0
        try:
            dual_writer = get_dual_writer()
            stream_key = dual_writer._stream_key(session_id, run_id)
            terminal_types = {"error", "done", "complete"}
            entries = await dual_writer.redis.xrange(stream_key, min="-", max="+")
            for entry_id, fields in entries:
                if fields.get("event_type") in terminal_types:
                    await dual_writer.redis.xdel(stream_key, entry_id)
                    removed += 1
        except Exception as e:
            logger.warning(
                "Failed to strip terminal stream events (session=%s run=%s): %s",
                session_id, run_id, e,
            )
        return removed
```

- [ ] **Step 4: 通过**

- [ ] **Step 5: Commit**: `feat(task): 支持重开 error trace 与清理流内残留终态事件`

---

### Task 3: 恢复流程改无缝（复用 run_id/trace + 隐藏指令 + 次数上限）

**Files:**
- Modify: `src/infra/task/recovery.py`（`resume_interrupted_run` 重写；删 `submit_recovery_run`/`_restore_recoverable_failure` 按需保留）
- Modify: `src/infra/task/manager.py`（`submit`/`submit_arq` 透传 `interrupted_resume`；`_submit_recovery_task`/`_submit_recovery_run` 清理）
- Modify: `src/infra/task/arq_worker.py`（payload 带 `interrupted_resume` 时 worker 侧并发槽 + 透传）
- Test: 更新 `tests/infra/task/test_manager_recovery.py`、`tests/infra/task/test_recovery_error_event.py`、`tests/infra/task/test_arq_worker.py`；新建 `tests/infra/task/test_seamless_resume.py`

**Interfaces:**
- Consumes: Task 1 的 `interrupted_resume` 参数、Task 2 的 `reopen_interrupted_trace`/`_strip_terminal_stream_events`。
- Produces: `resume_interrupted_run(session, source_run_id, reason)` 返回 `{"success", "run_id"(==source_run_id), "resumed_from_run_id", "seamless": True, "message"}`；metadata 新增 `resume_attempts`（int，恢复成功提交时 +1，>3 触发终态 FAILED 不可恢复）。

- [ ] **Step 1: 失败测试**（`tests/infra/task/test_seamless_resume.py`）

```python
async def test_resume_reuses_run_and_trace(recovery_service, session_stub):
    """恢复提交必须复用原 run_id/trace_id、message 为隐藏指令、user_message_written=True。"""
    result = await recovery_service.resume_interrupted_run(session_stub, "run_src_1", "server_restart")
    assert result["success"] is True
    assert result["run_id"] == "run_src_1"
    submit_kwargs = recovery_service._submit_task.await_args.kwargs
    assert submit_kwargs["run_id"] == "run_src_1"
    assert submit_kwargs["trace_id"] == "trace_src_1"
    assert submit_kwargs["user_message_written"] is True
    assert submit_kwargs["message"]  # 非空隐藏指令
    assert "emit_user_message" not in ...  # 不写 user:message UI 事件

async def test_resume_increments_attempts_and_caps(recovery_service, session_stub):
    """第 4 次恢复尝试直接终态 FAILED（不可恢复）且不再提交。"""

async def test_resume_failure_restores_recoverable(recovery_service, session_stub):
    """提交失败 → 恢复 FAILED+recoverable 元数据，等待下轮扫描重试。"""

async def test_resume_reopens_error_trace_and_strips_stream(...): ...
```

- [ ] **Step 2: 确认失败**

- [ ] **Step 3: 实现**（`recovery.py` 核心）

```python
_MAX_SEAMLESS_RESUME_ATTEMPTS = 3

    async def resume_interrupted_run(self, session, source_run_id, reason):
        # 前置检查（锁、current_run_id 一致性）沿用现有代码
        ...
        session_metadata = getattr(session, "metadata", None) or {}
        attempts = int(session_metadata.get("resume_attempts") or 0)
        if attempts >= _MAX_SEAMLESS_RESUME_ATTEMPTS:
            await self._mark_run_failed(source_run_id, "Resume attempts exhausted", session)
            return {"success": False, "run_id": None, "resumed_from_run_id": source_run_id,
                    "message": "恢复次数已达上限"}

        trace_id = await self._lookup_trace_id(source_run_id)   # 按 run_id 查最新 trace
        if trace_id:
            from src.infra.session.trace_storage import get_trace_storage
            await get_trace_storage().reopen_interrupted_trace(trace_id)
        await self._strip_terminal_stream_events(session.id, source_run_id)

        await self._storage.update(session.id, SessionUpdate(metadata=self._state_machine.build_metadata(
            TaskStatus.RECOVERING, run_id=source_run_id)))
        try:
            submit_result = await self._submit_seamless_resume(
                session, source_run_id, trace_id, reason,
            )
        except Exception:
            await self._restore_recoverable_failure(session.id, source_run_id, ...)
            ...
        await self._storage.update(... metadata={..., "resume_attempts": attempts + 1,
            "recovery_reason": reason, "task_recoverable": False, "task_error_code": None})
        return {"success": True, "run_id": source_run_id, "resumed_from_run_id": source_run_id,
                "seamless": True, "message": "任务已在原对话中恢复"}
```

`_submit_seamless_resume`：按 HITL 模板组装 common_kwargs（message=`build_recovery_message(reason, language)`，`user_message_written=True`，`run_id=source_run_id`，`trace_id=trace_id or None`，`interrupted_resume=True`，其余从 session metadata 透传 agent_options/persona/…）；arq 后端 `dispatch_id=f"resume:{source_run_id}:{uuid4().hex}"`，本地后端先 `try_acquire_run_slot`（失败→返回失败信息由上层 restore recoverable）再 `manager.submit(...)`。不经过 `_submit_recovery_task`（其本地分支会丢弃 trace_id/user_message_written）。

`mark_run_failed` 保留（超限终态用）；`submit_recovery_run` 不再被引用则删除，并同步删 `manager._submit_recovery_run`/`_submit_recovery_task` 与其注入（先 grep 测试引用再删）。`recovery_texts.py` 模块 docstring 更新为「隐藏的模型面指令，不落 UI 事件」。

`manager.submit`/`submit_arq`：签名与 run_task 调用、arq payload 各加 `interrupted_resume` 透传；`arq_worker.run_agent_task`：`if payload.get("interrupted_resume"):` 走与 hitl 相同的 `try_acquire_run_slot` + `Retry(defer=1)` 槽位获取（不需要 wait_for_hitl_resume_activation），并把 `interrupted_resume` 传给 `run_task`。

- [ ] **Step 4: 通过**（含 `tests/infra/task` 全目录 + `tests/api` 相关不回归）

- [ ] **Step 5: Commit**: `feat(task): 中断恢复复用原 run_id 无缝续跑并限制恢复次数`

---

### Task 4: 前端 `run:resumed` 事件处理（实时 + 历史重建）

**Files:**
- Modify: `frontend/src/hooks/useAgent/types.ts`（EventType 增加 `"run:resumed"`）
- Modify: `frontend/src/hooks/useAgent/eventHandlers.ts`（side-effect switch 增加 case）
- Modify: `frontend/src/hooks/useAgent/historyLoader.ts`（事件循环增加分支）
- Test: `frontend/src/hooks/useAgent/__tests__/runResumed.test.ts`（新建）

**Interfaces:**
- Consumes: 后端 `run:resumed` 事件（data 含 run_id/trace_id/timestamp）。

- [ ] **Step 1: 失败测试**

```ts
// eventHandlers：run:resumed 清空气泡内容型状态并回到 streaming
test("run:resumed resets assistant message content and streaming state", () => {
  handleStreamEvent(
    { event: "run:resumed", data: JSON.stringify({ run_id: "r1" }) },
    "msg-1", "evt-1", undefined, ctxWithMessage({
      id: "msg-1", role: "assistant", isStreaming: false, cancelled: true,
      content: "错误：xx", parts: [{ type: "cancelled" }],
    }),
  );
  const msg = getUpdatedMessage("msg-1");
  expect(msg.parts).toEqual([]);
  expect(msg.content).toBe("");
  expect(msg.cancelled).toBe(false);
  expect(msg.isStreaming).toBe(true);
});

// historyLoader：[message:chunk(半截), error, run:resumed, message:chunk(重生成)] → 只保留重生成内容
test("history rebuild keeps only post-resume content", () => { ... });
```

- [ ] **Step 2: 确认失败**：`cd frontend && pnpm test -- runResumed`

- [ ] **Step 3: 实现**

```ts
// eventHandlers.ts side-effect switch：
    case "run:resumed": {
      // 系统中断后同 run 无缝续跑：清空半截/错误内容，气泡回到流式空态，
      // 后续事件重新填充（模型会重新生成完整回答）。
      ctx.setMessages((prev) => {
        const exists = prev.some((m) => m.id === messageId);
        const reset: Partial<Message> & Pick<Message, "parts" | "content"> = {
          parts: [],
          content: "",
          toolCalls: [],
          toolResults: [],
          tokenUsage: undefined,
          duration: undefined,
          cancelled: false,
          isStreaming: true,
        };
        if (exists) {
          return prev.map((m) => (m.id === messageId ? { ...m, ...reset } : m));
        }
        return [
          ...prev,
          { id: messageId, role: "assistant" as const, timestamp: new Date(), ...reset } as Message,
        ];
      });
      return;
    }
```

```ts
// historyLoader.ts 事件循环（user:cancel 分支后）：
    if (eventType === "run:resumed") {
      // 中断后同 run 恢复：丢弃半截/错误累积，从空态继续折叠后续事件
      if (currentAssistantMessage) {
        currentAssistantMessage = {
          ...currentAssistantMessage,
          parts: [],
          content: "",
          toolCalls: [],
          cancelled: false,
        };
      }
      continue;
    }
```

- [ ] **Step 4: 通过 + 全量前端测试**：`cd frontend && pnpm test`

- [ ] **Step 5: Commit**: `feat(frontend): 处理 run:resumed 实现中断后原气泡续跑`

---

### Task 5: 全量验证 + PR

- [ ] `make lint && make typecheck`
- [ ] `uv run pytest tests/infra/task tests/api tests/infra/session -q`（至少覆盖改动面；时间允许跑 `make test` 后端全量）
- [ ] `cd frontend && pnpm test && pnpm run build`
- [ ] 更新 `docs/`：如存在「任务恢复/断线」相关文档页则补充无缝恢复行为（grep 确认，无则跳过）
- [ ] 分支 `feat/seamless-run-resume`，PR → `develop`，标题 `feat(task): 系统中断后同 run_id 无感续跑`
- [ ] CI 绿后合并；develop → main PR 合并；服务器 staging 验证（重启后端中断一轮对话，观察原气泡继续、无新 run 消息）；`update.sh` 部署 + `bash /root/disttest/run-all.sh` 回归

## Self-Review 结论

- 覆盖检查：中断三形态（优雅关停 Task 1 / 硬杀由 FAILED+recoverable 与 RUNNING 无心跳扫描进入同一恢复入口 Task 3 / arq 关停 Task 3 worker 侧）✔；前端实时 + 重连重放去重 + 历史重建三种视角 Task 4 ✔；防循环上限 Task 3 ✔。
- 类型一致性：`interrupted_resume` 参数名在 executor/manager/arq payload 三处一致；事件名统一 `run:resumed`。
- 已知取舍：恢复语义是「同气泡重新生成」而非逐 token 续写（LangGraph 硬中断无法从节点中间恢复）；中断前已产生的 token 消耗与工具副作用不回滚，与现状恢复流程一致。
