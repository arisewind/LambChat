# Daemon 连接与多机体验优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 daemon 连接升级为「推送优先 + 阻塞中继 + 三平台一致 + 专业选择器」的体验：在线状态秒级感知、命令下发去掉 50ms 轮询下限、桌面端生命周期健壮、机器选择专业化。

**Architecture:** 保留 daemon→服务端 SSE 外呼中继协议不变；服务端注册表事件化后经既有用户级 WS（`send_to_user_with_broadcast`）推送 presence 快照；前端以 `createSingletonStore` 全局单例状态层消费推送并降级轮询对账；中继链路 `LPOP/GET` 轮询改 `BLPOP` 阻塞读；Tauri 壳补齐 Windows 优雅停止与重启预算恢复。

**Tech Stack:** FastAPI + redis.asyncio + pytest（后端）；React 19 + vitest + @testing-library（前端）；Tauri v2 + Rust（桌面壳）；httpx（daemon Python 客户端）。

**Spec:** `docs/superpowers/specs/2026-09-07-daemon-connection-optimization-design.md`

## Global Constraints

- daemon SSE 协议（`GET /api/sandbox/channel` + `POST /results/{call_id}`）保持向后兼容：旧 daemon 不带 `machine_id` 回传时跳过机器绑定校验。
- 路由层禁止 `raise HTTPException`，一律 `AppError(ErrorCode.X)`；新增错误码必须同步 zh/en/ja/ko/ru 五个 locale 的 `backendErrors.*`。
- 面向用户的新文案必须五语同步（`frontend/src/i18n/locales/`）。
- 前端测试位于 `frontend/src/**/__tests__/*.test.{ts,tsx}`；后端测试镜像 `src/` 结构于 `tests/`。
- 提交遵循 Conventional Commits + 中文描述，如 `feat(sandbox): …`。
- 不覆盖工作区已有未提交改动（`frontend/src/components/common/__tests__/tooltipControlledOpen.test.tsx` 属用户改动，不得提交）。
- 每个任务先写失败测试（RED）→ 最小实现（GREEN）→ 提交。

---

## Phase 0 — 在线判定修复与默认本地档（用户实测痛点，最高优先）

### Task 0a: /status 多机在线判定修复

**Files:**
- Modify: `src/api/routes/sandbox.py`（`sandbox_status` :325）
- Test: `tests/api/routes/test_sandbox_routes.py`（追加多机在线用例）

**根因：** `sandbox_status` 只读 legacy hash（`get_active`）；多机 daemon 注册进
`sandbox:machine:*`，`/status` 永远 `{"online": false}` → 前端本地档永久不可用。

**实现：**
```python
@router.get("/status")
async def sandbox_status(user: TokenPayload = Depends(get_current_user_pat_or_jwt)):
    registry = _registry()
    online = await registry.is_online(user.sub)
    if not online:
        return {"online": False}
    # 元数据从解析出的目标机读（多机优先，legacy 回退），无目标时保底 legacy active
    target = await registry.resolve_target(user.sub)
    if target is None:
        return {"online": True}
    value = await registry._machine_value(user.sub, target)
    return {
        "online": True,
        "client_id": target,
        "daemon_version": parse_daemon_version(value) or None,
        "daemon_platform": parse_daemon_platform(value) or None,
        "daemon_confirm_policy": parse_confirm_policy(value) or None,
    }
```
（`_machine_value` 是现有私有方法，直接复用；测试覆盖：仅多机在线 → online+元数据；仅 legacy 在线 → 行为不变；全离线 → false。）

### Task 0b: 前端 online 双保险 + 默认本地档

**Files:**
- Modify: `frontend/src/components/layout/AppContent/useAgentOptions.ts`
- Modify: `frontend/src/stores/sandboxStatusStore.ts`（Task 4 产物；本任务先行时先以
  `useSandboxStatus().online` 接线，Task 4 落地后改读 store）
- Test: `frontend/src/components/layout/AppContent/__tests__/`（新增 useAgentOptions 用例）

**实现要点：**
- `online` 推导增强（hook/store 层）：`online = status.online || machines.some(m => m.online !== false)`。
- 新增纯函数：
```ts
export function resolveSandboxDefault(stored: string | null, online: boolean): "local" | "cloud" {
  if (stored === "local" || stored === "cloud") return stored;
  return online ? "local" : "cloud";
}
```
- `buildAgentOptionValues` 接受 `{sandboxOnline?: boolean}`：sandbox 键默认值 =
  `resolveSandboxDefault(localStorage.getItem("defaultSandboxMode"), sandboxOnline)`。
- `useAgentOptions` 订阅沙箱在线状态；离线→在线首次翻转时派发
  `sandbox-online-changed` 事件，hook 内若本会话未手动切换过 sandbox 键
  （`sandboxTouchedRef`）则把值翻为 "local"（镜像 thinking-preference-updated 模式）。
- 测试：在线时默认 local；离线默认 cloud；stored 偏好优先；手动切过不翻转。

## Phase 1 — presence 推送与前端全局状态层

### Task 1: registry 机器记忆层（last_seen + 离线机保留）

**Files:**
- Modify: `src/infra/sandbox/relay/registry.py`
- Test: `tests/infra/sandbox/relay/test_registry_machines.py`（追加用例）

**Interfaces:**
- Produces: `list_machines(user_id, include_offline: bool = False)`；机器 dict 新增 `last_seen: float | None`；新 hash 键 `sandbox:machseen:{uid}`（value 为 JSON `{"ts","name","platform","version","confirm_policy"}`，register/heartbeat 时写入）。

**实现要点：**
- `_machseen_key(user_id)` 新键；`register`/`heartbeat` 多机路径 `hset`（JSON，含上报 name/platform/version/policy）。
- `list_machines`：`include_offline=False` 行为不变（仅在线机，但每台带 `last_seen`）；`include_offline=True` 时追加 machseen 中已知但当前离线的机器（`online: False`），排除 legacy。
- `forget_machine` 追加 `hdel(_machseen_key)`。
- 测试：注册→离线（TTL 过期/删键）→`include_offline=True` 仍列出且 `online=False`、`last_seen` 为写入 ts；`include_offline=False` 不列出；forget 后彻底消失。

### Task 2: presence 快照与推送模块

**Files:**
- Create: `src/infra/sandbox/relay/presence.py`
- Test: `tests/infra/sandbox/relay/test_presence.py`（新建）

**Interfaces:**
- Produces:
  - `SANDBOX_PRESENCE_EVENT = "sandbox:presence"`
  - `async def build_presence_snapshot(user_id: str) -> dict` → `{"type": "sandbox:presence", "data": {"machines": [...include_offline 全量...], "default_machine_id": str | None, "legacy_online": bool, "revision": float(time.time())}}`
  - `async def publish_presence(user_id: str) -> None`：经 `get_connection_manager().send_to_user_with_broadcast` 推送；任何异常仅 `logger.warning`，不上抛。

**实现要点：** snapshot 的 machines 来自 `list_machines(uid, include_offline=True)`；`legacy_online` 来自 `is_online`（或 get_active 非空）。测试用 fake manager/monkeypatch：断言事件类型、revision 单调、推送异常不上抛、machines 含离线条目。

### Task 3: sandbox.py 挂钩 presence 推送

**Files:**
- Modify: `src/api/routes/sandbox.py`（register 后 / generator finally / offline / rename / default / forget 共 6 处）
- Test: `tests/api/routes/test_sandbox_routes.py`（追加）

**实现要点：** 每处状态变更后 `await publish_presence(user.sub)`（publish 内部自吞异常，不影响主流程）。测试：monkeypatch `sandbox.routes` 命名空间下的 `publish_presence`，断言注册/注销/offline/rename/default/forget 各触发一次且携带正确 user_id。

### Task 4: 前端 sandboxStatusStore 全局状态层

**Files:**
- Create: `frontend/src/stores/sandboxStatusStore.ts`
- Test: `frontend/src/stores/__tests__/sandboxStatusStore.test.ts`

**Interfaces:**
- Consumes: `sandboxApi.getStatus()`、`sandboxApiMachines.listMachines()`（Task 5 后 machines 含离线条目与 `last_seen`）。
- Produces:
  - `getSandboxStatusStoreState()` / `subscribeSandboxStatus(listener)`（useSyncExternalStore 用）
  - `attachSandboxStatusStore(): () => void` —— 订阅引用计数：0→1 启动全局刷新器，1→0 停止；返回 detach
  - `refreshSandboxStatus()` —— 在途去重的共享刷新（status+machines 并行）
  - `applySandboxPresence(data)` —— 应用 `sandbox:presence` 快照（revision 比当前旧则丢弃）
  - `setSandboxWsHealthy(b: boolean)` —— true 时立即对账一次
  - state: `{ status, statusError, machines, defaultMachineId, wsHealthy, lastSyncedAt }`

**行为规格（测试覆盖）：**
- 刷新在途去重：并发两次 `refreshSandboxStatus()` 只打一组 API。
- 轮询节拍：`wsHealthy=true` 60s / `false` 10s；`visibilitychange` hidden 时暂停、visible 时立即补拉（fake timers）。
- presence 应用：machines/default 更新、旧 revision 丢弃。
- 引用计数：attach×2 → detach×2 后定时器清空。

### Task 5: useSandboxStatus 改读 store + useWebSocket 接入 presence

**Files:**
- Modify: `frontend/src/hooks/useSandboxStatus.ts`（内部改 store，导出 API 形状不变：`{status, statusError, online, machines, defaultMachineId, refresh}`；`enabled:false` 不订阅不返回数据）
- Modify: `frontend/src/hooks/useWebSocket.ts`：消息分发新增 `sandbox:presence` → `onSandboxPresence` 回调；连接建立/断开回调 `onWsOpen`/`onWsClose`
- Modify: `frontend/src/components/layout/AppContent/useWebSocketNotifications.tsx`：`onSandboxPresence: (n) => applySandboxPresence(n.data)`、`onWsOpen: () => setSandboxWsHealthy(true)`、`onWsClose: () => setSandboxWsHealthy(false)`
- Test: 更新 `frontend/src/hooks/__tests__/useSandboxStatus.test.tsx`、新增 useWebSocket presence 分发用例

**实现要点：** `SANDBOX_STATUS_REFRESH_EVENT` 事件监听移入 store（收到即 `refreshSandboxStatus()`）。useWebSocket 校验：`data.machines` 为数组且每项 `machine_id` 为 string、`revision` 为 number，非法丢弃。

## Phase 2 — 阻塞中继与结果队列

### Task 6: channel_frames BLPOP 阻塞下发

**Files:**
- Modify: `src/api/routes/sandbox.py`（`channel_frames` 循环 + `sandbox_channel` 端点建/关专用连接）
- Test: `tests/api/routes/test_sandbox_routes.py`（既有 25 用例适配 + 新增）

**Interfaces:**
- `channel_frames(..., stream_redis, blpop_timeout: float = 1.0)`：`stream_redis` 是专用阻塞连接（`create_redis_client(isolated_pool=True)`），generator finally `aclose()`。
- 循环结构：心跳检查 → `item = await stream_redis.blpop(req_key, timeout=blpop_timeout)`；`item is None`（超时）则回到心跳检查；非 None 走既有 ts 判龄与 tool_call 下发。

**要点：** 共享 `redis` 仍用于 owner 校验/heartbeat；`blpop_timeout` 可注入小值供测试（fakeredis blpop 真睡 timeout）。既有测试断言下发行为不变。

### Task 7: 结果队列化 + dispatch BLPOP + 调用-机器绑定

**Files:**
- Modify: `src/api/routes/sandbox.py`（`/results/{call_id}`：`SET`→`RPUSH`+`EXPIRE`；新增 `machine_id` query 参数校验）
- Modify: `src/infra/sandbox/relay/dispatch.py`（等待改 `BLPOP`，旧 key `GET` 兜底；入队前写 `sandbox:callassign:{call_id}` = target machine_id `ex=120`，finally 清理）
- Modify: `src/kernel/errors.py`（新增 `SANDBOX_RESULT_MISMATCH = ("sandbox_result_mismatch", 409, ...)`）
- Test: `tests/api/routes/test_sandbox_routes.py`、`tests/infra/sandbox/relay/test_dispatch.py`

**契约：**
- 端点：`assigned = GET sandbox:callassign:{call_id}`；`assigned` 存在且请求带 `machine_id` 且不等 → `AppError(SANDBOX_RESULT_MISMATCH)`，不写队列；`machine_id` 缺省（旧 daemon）→ 放行（兼容窗口）。
- 写入：`RPUSH sandbox:resp:{call_id} <json>` + `EXPIRE 120`。
- dispatch 等待循环：`blpop(resp_key, timeout=min(1.0, 剩余))`；超时后 `GET` 一次兜底（滚动发布窗口内旧实例 SET 写入的值）；ack/done 决策逻辑不变；模块级 `_BLPOP_TIMEOUT = 1.0` 供测试注入。
- 测试：多机冒答被拒（409 + callassign 不被消费）；旧格式 SET 值仍可被 GET 兜底读到；ack→done 两阶段 BLPOP 顺序正确。

### Task 8: payload 早期拒绝 + 错误码五语

**Files:**
- Modify: `src/api/routes/sandbox.py`（`/results` 先查 `Content-Length` 头，超限直接 `SANDBOX_PAYLOAD_TOO_LARGE`，不再 `await request.body()` 后才判）
- Modify: `frontend/src/i18n/locales/{zh,en,ja,ko,ru}.json`：`backendErrors.sandboxResultMismatch` 五语
- Test: 路由测试追加 CL 超限拒绝用例；`backendErrorCodeCoverage.test.ts` 自动校验

### Task 9: daemon 客户端两处小改（machine_id 回传 + SIGBREAK）

**Files:**
- Modify: `client/lambchat_sandbox/transport.py`（`post_result` URL 追加 `?machine_id=`，有 machine_id 时）——签名不变，URL 内部拼
- Modify: `client/lambchat_sandbox/daemon.py`（`_install_sigterm_cancel` → Windows fallback：`loop.add_signal_handler` 抛 NotImplementedError 且存在 `signal.SIGBREAK` 时，`signal.signal(SIGBREAK, ...)` 经 `loop.call_soon_threadsafe(task.cancel)` 触发同一取消路径）
- Test: `tests/client/test_transport.py`（URL 断言）、`tests/client/test_daemon.py`（monkeypatch 假 loop/假 SIGBREAK 验证 fallback 注册）

## Phase 3 — 桌面端三平台生命周期

### Task 10: daemon.rs 重启预算恢复 + 状态事件推送

**Files:**
- Modify: `frontend/src-tauri/src/daemon.rs`（`DaemonManager` 增加 `started_at: Instant`；`handle_exit` 自动重启前若 uptime ≥ 300s 则 `restarts = 0`；重启间隔按 `min(2^restarts, 30s)` 退避；start/stop/exit 时 `app.emit("sandbox-daemon-status", {running, generation, restarts})`）
- Test: `daemon.rs` 内 `#[cfg(all(test, unix))]` 单测追加（uptime 重置逻辑用注入时钟/fake 分离纯函数 `fn should_reset_budget(uptime: Duration) -> bool`）

### Task 11: Windows 停止链 + 前端订阅替代轮询

**Files:**
- Modify: `frontend/src-tauri/src/daemon.rs`（`#[cfg(windows)]` stop 分支：`taskkill /PID {pid} /T`（不带 /F，先给优雅机会）→ 宽限轮询 → `taskkill /PID {pid} /T /F` → 句柄 kill 兜底）
- Modify: `frontend/src/services/tauri/sandboxShell.ts`（新增 `subscribeDaemonStatus(cb): Promise<UnlistenFn | null>`，封装 `@tauri-apps/api/event` 的 `listen("sandbox-daemon-status")`）
- Modify: `frontend/src/components/profile/LocalSandboxSection.tsx`（10s 轮询 `daemon_process_status` 改为初始 invoke 一次 + 订阅事件）
- Test: `sandboxShell.test.ts`、`localSandboxSection.test.tsx` 适配

## Phase 4 — 机器选择器专业化

### Task 12: 选择器/卡片 UX + i18n 五语

**Files:**
- Modify: `frontend/src/services/api/sandbox.ts`（`SandboxMachine` 增 `online?: boolean`、`last_seen?: number | null`）
- Modify: `frontend/src/components/chat/sandboxOption.ts`（`buildSandboxMachineOption`：排序「默认机 → 在线 → 离线」；离线条目 `disabled: true` 且 label 追加离线标记；`shouldShowSandboxMachineOption` 兼容含离线机列表——仅当无任何**在线**机时隐藏）
- Modify: `frontend/src/components/chat/ChatInputSelectors.tsx`、`RunModePopover.tsx`（机器行渲染平台徽标：`win32→Windows / darwin→macOS / 其他→Linux` 文本徽标 + 在线点）
- Modify: `frontend/src/components/profile/SandboxMachinesCard.tsx`（平台徽标、相对 last_seen、离线置灰、忘记机器操作接 `forgetMachine`）
- Modify: `frontend/src/i18n/locales/{zh,en,ja,ko,ru}.json`（`profile.sandbox.lastSeen`、`profile.sandbox.forgetMachine`、`profile.sandbox.forgetMachineConfirm`、`agentOptions.sandboxMachine.offline` 等）
- Test: `sandboxMachineOption.test.ts`、`sandboxMachinesCard` 相关组件测试

## Phase 5 — 全量验证

### Task 13: 验证与收尾

- `make lint && make typecheck`
- `uv run pytest tests/infra/sandbox tests/api/routes/test_sandbox_routes.py tests/client -q`
- `cd frontend && pnpm test && pnpm run build`
- `cd frontend/src-tauri && cargo check`
- 检查 git diff 只含本计划文件；提交规范核查

## 自检记录

- Spec 覆盖：§5.1→T2/T3；§5.2→T4/T5；§5.3→T6/T7/T8/T9；§5.4→T9/T10/T11；§5.5→T12；§5.6→T7（绑定）/T8（CL）；§7 Phase5 指标按 YAGNI 缩减为既有日志观测（偏差已在计划中注明，spec 对应条目待评审确认）。
- 类型一致性：`list_machines(include_offline)`（T1）↔ presence snapshot（T2）↔ 前端 `SandboxMachine.online/last_seen`（T12）链路字段一致；`applySandboxPresence(data)`（T4）↔ `onSandboxPresence`（T5）payload 形状一致；`SANDBOX_RESULT_MISMATCH`（T7）↔ locale key `sandboxResultMismatch`（T8）一致。
- 占位符：无 TBD/TODO（Rust Windows 分支为具体命令序列，非占位）。
