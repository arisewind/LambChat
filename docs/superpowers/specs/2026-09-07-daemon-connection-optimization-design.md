# Daemon 连接与多机体验优化设计

- 日期：2026-09-07
- 状态：待评审
- 范围：daemon 中继、前端在线状态、桌面端进程托管、机器选择与同步性能

## 1. 目标

将本地 daemon 连接升级为稳定、快速、跨平台一致的体验：

1. 一个用户可以管理多个 daemon/机器，并在会话中显式选择目标机器。
2. 桌面客户端启动后自动拉起 daemon，快速完成注册并即时反映在线状态。
3. macOS、Linux、Windows 在启动、重连、停止、状态展示和 shell 执行语义上保持一致。
4. 前端从重复轮询改为共享状态 + 实时推送 + 低频对账。
5. daemon 命令下发与结果回传不再依赖 50ms 轮询，降低 Redis 空转和端到端延迟。
6. 保持现有 SSE daemon 协议和旧 daemon 兼容路径，不要求一次性迁移全部客户端。

## 2. 非目标

- 本期不把 daemon 通道整体改成 WebSocket。
- 本期不引入 Redis Streams 作为新的持久化队列。
- 不同步聊天会话、消息或任务数据；daemon 继续只承担本地沙箱执行与文件操作。
- 不支持同一台机器上多个 daemon 实例的业务级选择；一个在线 machine 对应一个 daemon 实例。

## 3. 现状与约束

当前链路为：daemon 主动建立 SSE `/api/sandbox/channel`，服务端以 Redis list 中继命令，daemon 通过 HTTP POST 回传结果；前端通过 `/api/sandbox/status` 和 `/api/sandbox/machines` 轮询。仓库已有用户级 WebSocket、Redis pub/sub、机器注册表、Tauri sidecar 管理和三平台 shell 抽象，可作为增量改造基础。

必须保持：

- PAT-only daemon 通道鉴权和 `sandbox:execute` scope。
- `sandbox_machine_id` 会话级目标选择语义。
- legacy 单机 daemon 的兼容行为。
- 现有错误码契约和五语 i18n 覆盖。
- 不覆盖工作区已有未提交用户改动。

## 4. 总体方案

采用“推送优先、轮询对账、阻塞中继、平台统一”的渐进方案：

- 服务端注册/注销机器后，向用户级 WebSocket 推送 daemon/machine presence 快照。
- 前端新增 `SandboxStatusProvider`，全局只维护一个状态源；WebSocket 在线时低频对账，断线时提高轮询频率。
- daemon 命令队列从 `LPOP + sleep` 改为带超时的阻塞读取；结果等待从 Redis key 轮询改为结果队列阻塞读取。
- Tauri 端统一启动状态事件、重连预算恢复、Windows 优雅停止和进程树清理。
- 机器选择器提供平台标识、默认机、在线状态、版本、最近心跳和错误提示。

## 5. 详细设计

### 5.1 服务端 presence 事件

在 `SandboxClientRegistry` 或其调用边界增加用户级 presence 快照生成函数，快照包含：

- `machines`: `machine_id`、展示名、平台、daemon 版本、确认策略、online、last_seen
- `default_machine_id`
- `legacy_online`（兼容无 machine_id daemon）
- `revision` 或生成时间戳，用于前端丢弃旧事件

以下事件触发全量快照推送：

- daemon 注册成功
- 心跳续期导致在线元数据变化
- SSE 流 finally 注销
- `/offline` 主动下线
- 机器重命名、设置默认机、忘记机器

复用现有 `send_to_user_with_broadcast`，事件类型为 `sandbox:presence`。推送失败不影响注册/注销主流程，前端通过对账恢复一致性。

presence 事件只面向当前用户，不包含 PAT、路径或命令内容。

### 5.2 前端共享状态与同步策略

新增 `SandboxStatusProvider` 和 `useSandboxStatusContext`：

- App 生命周期内单例拉取状态和机器列表。
- 首次挂载立即请求一次。
- WebSocket 连接成功后立即对账一次；收到 `sandbox:presence` 直接更新快照。
- WebSocket 健康时每 60 秒对账；WebSocket 断线时回退 10 秒对账。
- `visibilitychange`：后台暂停定时器，回前台立即刷新。
- 请求在途去重，status/machines 合并为一次共享刷新流程。
- 保留现有 `useSandboxStatus` API，改为读取 Context，降低组件改动范围。

前端 WebSocket 消息解析只接受结构化 `type` 和版本正确的 payload；未知消息忽略。收到旧 `revision` 时丢弃。

### 5.3 daemon 中继低延迟化

命令下发：

- `sandbox.py` 使用独立 Redis 客户端/连接执行 `BLPOP`，超时设置为 1 秒，以便周期性检查 stop event 和发送 heartbeat。
- 保持陈旧请求丢弃、机器队列隔离和 legacy 队列兼容。
- 阻塞读取失败时退出当前 SSE 流，让 daemon 走既有重连机制。

结果回传：

- 结果端点把同一 `call_id` 的 ack/done 写入短生命周期 Redis list，并设置 TTL。
- `dispatch_local_call` 使用 `BLPOP` 等待结果，严格按剩余 ack/exec deadline 控制超时。
- 继续校验 user_id，并新增调用目标 machine_id 绑定校验，防止同用户其他机器冒答。
- 结果 body 优先使用 `Content-Length` 做早期拒绝；对无长度请求增加受控流式读取上限，避免先完整读入内存。

兼容策略：短期保留旧 key 读取兜底，待所有 daemon/服务端实例完成发布后再移除。

### 5.4 自动连接与 Tauri 生命周期

桌面端启动：

1. Tauri setup 启动 sidecar。
2. sidecar 读取本地配对配置并立即连接服务端。
3. 服务端 presence 推送到前端，UI 更新为在线。
4. 失败时显示明确阶段状态：启动中、连接中、需要重新配对、需要升级、离线。

Rust `DaemonManager`：

- 将运行状态变化通过 Tauri event 推送给前端，前端只在初始化时 invoke 查询一次。
- 意外退出继续自动重启；daemon 连续稳定运行 5 分钟后重置重启预算。
- 重启采用指数退避和抖动，避免短时间重启风暴。
- generation 保护和 stop/start 竞态保护保持不变。

Windows：

- sidecar 使用独立进程组。
- 优雅停止优先发送 console control 事件；不支持时使用 `taskkill /T`，最后才使用句柄 kill。
- daemon 增加 `SIGBREAK` 兼容处理，确保 offline 和审计尽量执行。
- 进程树退出后再向 UI 发 stopped，避免显示假离线。

macOS/Linux：

- 保留 SIGTERM → 宽限 → SIGKILL 兜底。
- 确保父进程退出监护、权限和 `~/.lambchat` 文件权限策略一致。

### 5.5 机器选择器与专业化 UI

机器作为独立选择维度展示：

- 默认机置顶，并标注“默认”。
- 按平台显示 macOS/Linux/Windows 图标。
- 展示在线点、机器名、版本、最近在线时间。
- 在线机器可选；离线机器保留但置灰，并给出离线原因/切换建议。
- 选择结果继续写入会话级 `sandbox_machine_id`；未选择时沿用默认机解析。
- 最近一次会话选择持久化到本地 UI 偏好，不改变服务端默认机。
- 设置页提供机器重命名、设为默认、忘记机器和刷新状态。

所有用户可见文案同步 zh/en/ja/ko/ru。

### 5.6 在线判定修复与默认本地档

**在线判定 bug（用户实测「daemon 已运行但本地不可用」的根因）**：
`GET /api/sandbox/status` 只读 legacy 单机 hash（`get_active`），多机 daemon（带
machine_id，新版客户端全部如此）注册进 `sandbox:machine:*` 后该端点永远返回
`{"online": false}`——纯 web 本地档不渲染、桌面壳本地档永久置灰。修复：

- `/status` 在线判定改为 `is_online`（legacy 或任一机器在线即在线）；
- daemon 元数据（version/platform/confirm_policy）从 resolve_target 解析的目标机读取；
- 前端 store 的 `online` 同时参考 machines 列表（`status.online || 任一机器在线`），
  双保险。

**默认本地档**：客户端默认运行环境从硬编码 `cloud` 改为「本地优先」——
daemon 在线时新会话默认选本地档，离线时默认云端档；用户在会话中手动切换过
沙箱档位后不再被自动翻转。`localStorage["defaultSandboxMode"]`（"local"|"cloud"）
存在时优先用户显式偏好。

### 5.7 安全和数据一致性

- 结果响应绑定 `call_id + user_id + target_machine_id`。
- 机器重命名和设默认前校验机器归属；不存在机器返回统一错误码。
- presence 快照不泄露敏感信息。
- 离线注销失败时保留本地凭据清理和明确的待同步状态，不在 UI 伪报成功。
- 继续限制结果 payload、文件操作 payload 和命令超时。

## 6. 错误处理

- WebSocket 断开：自动降级轮询，不打断聊天。
- Redis 阻塞读取异常：关闭当前 daemon SSE，daemon 按指数退避重连。
- 结果队列超时：继续返回现有 `sandbox_timeout`，并清理调用上下文。
- daemon 版本不满足：保留 426 和 `daemon_version_unsupported`，UI 提供升级指引。
- Windows 优雅停止失败：记录可诊断日志，执行进程树兜底清理。
- 任一 presence 推送异常：记录日志，由轮询对账恢复。

## 7. 分阶段实施

### Phase 1：共享状态层与状态事件

- `SandboxStatusProvider`
- WebSocket presence 消息接入
- 服务端 presence 快照和推送
- 轮询降级/可见性门控

### Phase 2：阻塞中继与结果等待

- 命令 `BLPOP`
- 结果队列 `BLPOP`
- 兼容读取、deadline、目标机绑定
- payload 早期大小拒绝

### Phase 3：三平台生命周期

- Tauri 状态事件
- 重启预算恢复与退避
- Windows console control/taskkill 进程树处理
- daemon SIGBREAK

### Phase 4：机器选择器与体验

- 平台图标、默认机、last_seen、离线状态
- 会话选择持久化
- 设置页操作反馈和五语文案

### Phase 5：清理与观测

- 移除重复旧轮询/死代码
- 增加连接延迟、重连次数、presence 延迟、Redis 队列等待指标
- 完成兼容窗口后删除旧结果 key 兜底

## 8. 测试策略

后端：

- registry presence 快照、revision、归属校验
- 注册/注销/rename/default 的推送触发
- BLPOP 下发和结果等待的超时、断连、兼容路径
- 结果机器绑定和 payload 限制
- Redis/WS 异常不影响核心 daemon 流程

前端：

- Provider 单例请求去重、WebSocket 推送、revision 丢弃、断线降级、可见性恢复
- 机器排序、默认机、平台图标、离线禁用
- 现有 `useSandboxStatus` 消费者兼容
- 五语错误码覆盖和文案覆盖

Tauri/daemon：

- Linux/macOS 信号停止、Windows fallback 分支
- 重启预算恢复、退避和 generation 竞态
- SIGBREAK/优雅 offline
- 现有三平台 shell_quote、executor、打包测试继续通过

## 9. 验收指标

- 同一页面的 daemon 状态请求只有一个共享轮询源。
- WebSocket 正常时，daemon 上下线到 UI 状态更新目标 P95 < 2 秒。
- 命令下发不再固定 50ms 轮询，空闲 daemon Redis 轮询 QPS 显著下降。
- daemon 结果等待不再固定 50ms GET 轮询。
- 三平台启动、选择、执行、退出流程均有自动化测试覆盖。
- 不引入现有旧 daemon 无法连接的强制协议破坏。

## 10. 开源实践参考

- [Cloudflare Tunnel run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)：外呼连接、指数退避和重试治理。
- [Tailscale DERP servers](https://tailscale.com/docs/reference/derp-servers)：长连接、心跳和中继连接管理。
- [Tailscale connection types](https://tailscale.com/docs/reference/connection-types)：直连与中继的分层思路。
