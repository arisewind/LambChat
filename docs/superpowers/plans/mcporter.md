# mcporter 沙箱 MCP 集成方案

## Context

当前 LambChat 的 MCP 系统仅支持外部 HTTP/SSE 服务器（通过 `langchain-mcp-adapters` 连接）。用户希望：
1. 在沙箱内运行 MCP 服务器（stdio 类型），通过 mcporter 管理
2. 用户输入命令（如 `npx -y firecrawl-mcp`），Agent 自动在沙箱内安装、配置、调用
3. 沙箱 MCP 与外部 MCP 在前端同一面板显示

## mcporter 简介

[mcporter](https://github.com/steipete/mcporter)（by Johannes Stein）是一个 TypeScript/CLI 工具，用于连接、管理和调用 MCP 服务器。核心能力：

| 能力 | 说明 |
|---|---|
| **零配置发现** | 自动发现 Cursor / Claude Code / Codex 等已配置的 MCP 服务器 |
| **工具调用** | `mcporter call` 直接调用任何 MCP 服务器的工具 |
| **stdio + HTTP** | 同时支持 stdio 和 HTTP 传输 |
| **config 管理** | `mcporter config add/remove/list` 管理 MCP 服务器配置 |
| **环境变量注入** | `--env KEY=value` 为 stdio 命令注入环境变量 |
| **JSON 输出** | `--json` / `--output json` 提供机器可读输出 |

### 常用命令速查

```bash
# 列出所有已配置的 MCP 服务器
mcporter list --json

# 列出某个服务器的工具（含 schema）
mcporter list <server> --json

# 添加 stdio MCP 服务器
mcporter config add <name> --stdio "<command>" --env KEY=value

# 移除 MCP 服务器
mcporter config remove <name>

# 调用工具（flag 风格）
mcporter call <server>.<tool> key1=value1 key2=value2 --output json

# 调用工具（函数调用风格）
mcporter call '<server>.<tool>(key1: "value1", key2: "value2")'

# 列出配置来源
mcporter config list --source import --json
```

### 配置文件

mcporter 使用 JSONC 格式的配置文件，存放在 `~/.mcporter/mcporter.json`（全局）或 `config/mcporter.json`（项目级）。格式与 Cursor/Claude 的 MCP 配置兼容：

```jsonc
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

> `${VAR}` 语法支持环境变量插值，`${VAR:-fallback}` 支持默认值。

## 方案概览

新增 `sandbox` 传输类型，复用现有 MCP 存储层（MongoDB），在沙箱内通过 mcporter CLI 管理生命周期。Agent 通过 `execute()` 调用 mcporter 命令操作沙箱内 MCP。

### 架构

```
用户添加 "sandbox" 类型 MCP（command: "npx -y firecrawl-mcp"）
  → 存入 MongoDB（transport=sandbox, command=..., env_keys=[...]）
  → 前端 MCPPanel 显示（badge: "Sandbox"）
  → Agent 发现 sandbox 类型 MCP → 注入专用工具
  → 工具内部：sandbox.execute("mcporter call server.tool arg=val --output json")
  → mcporter 在沙箱内启动 stdio MCP server，调用工具，返回结果
```

### 数据流

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│ Frontend │────▶│  REST API    │────▶│  MongoDB    │────▶│ MCPStorage       │
│ MCPPanel │◀────│ /api/mcp/*   │◀────│ mcp_servers │◀────│ (读写 sandbox 配置)│
└─────────┘     └──────────────┘     └─────────────┘     └──────────────────┘
                      │                                          │
                      │ discover_tools (sandbox 类型)              │ sandbox MCP configs
                      ▼                                          ▼
               ┌──────────────┐                           ┌──────────────┐
               │  Sandbox     │  mcporter list --json     │ Agent Context │
               │  Discovery   │◀──── sandbox.execute() ───│ (注入工具)     │
               │  Module      │                           └──────┬───────┘
               └──────────────┘                                  │
                                                                  │ tool invoke
                                                                  ▼
                                                           ┌──────────────┐
                                                           │ E2B Sandbox   │
                                                           │ mcporter call │
                                                           │ stdio MCP srv │
                                                           └──────────────┘
```

---

## 沙箱持久化方案（核心）

### 问题

E2B 沙箱有以下生命周期事件会导致沙箱内容丢失：
1. **超时销毁** — 超过 `E2B_TIMEOUT` 后沙箱被 kill（即使 `auto_pause=true`，长时间不活跃仍会销毁）
2. **平台回收** — E2B 可能回收不活跃的沙箱
3. **模板更新** — 重建 E2B 模板后旧沙箱不可用
4. **手动重置** — 用户或管理员手动销毁沙箱

当沙箱被替换时，沙箱内的 mcporter 配置文件（`~/.mcporter/mcporter.json`）和通过 `npx` 安装的 MCP 包都会丢失。

### 策略：声明式重建（Declarative Rebuild）

**核心原则**：MongoDB 是唯一的数据源（Single Source of Truth），沙箱内的 mcporter 配置是衍生状态（Derived State）。

```
MongoDB (truth) ──rebuild──▶ 沙箱内 mcporter config (ephemeral)
```

#### 重建流程

```
SessionSandboxManager.get_or_create()
  │
  ├─ 沙箱缓存命中 → 直接使用
  │
  ├─ 沙箱暂停恢复 (E2B auto-pause/resume)
  │   └─ mcporter config + npm 缓存仍在磁盘 → 无需重建 ✅
  │
  ├─ 沙箱不存在/不可用 → 创建新沙箱
  │   ├─ E2BAdapter.create_sandbox(envs=user_envs)
  │   └─ 触发 sandbox_mcp_rebuild(user_id) ← 关键步骤
  │
  └─ sandbox_mcp_rebuild(user_id)
      ├─ 从 MongoDB 加载用户所有 transport=sandbox 且 enabled 的 MCP
      ├─ 对每个 MCP 执行 mcporter config add（写入 ~/.mcporter/mcporter.json）
      ├─ 对 npx 类型的 command 预热 npm 缓存（后台异步）
      └─ 返回重建结果（成功/失败的服务器列表）
```

#### 实现位置

在 `SessionSandboxManager._create_and_bind_e2b()` 中，沙箱创建成功后触发重建：

```python
async def _create_and_bind_e2b(self, session_id, user_id):
    # ... 现有的沙箱创建逻辑 ...

    # 沙箱创建成功后，重建 sandbox MCP 配置
    try:
        await self._rebuild_sandbox_mcp(user_id, backend)
    except Exception as e:
        logger.warning(f"[E2B] Sandbox MCP rebuild failed (non-blocking): {e}")

    return backend, work_dir

async def _rebuild_sandbox_mcp(self, user_id: str, backend: CompositeBackend):
    """在新沙箱内重建 mcporter 配置（声明式重建）"""
    from src.infra.mcp.storage import MCPStorage
    from src.infra.envvar.storage import EnvVarStorage

    storage = MCPStorage()
    env_storage = EnvVarStorage()

    # 1. 加载用户的 sandbox 类型 MCP
    servers = await storage.list_user_servers(user_id)
    sandbox_servers = [s for s in servers if s.transport == MCPTransport.SANDBOX and s.enabled]

    if not sandbox_servers:
        return

    # 2. 加载用户环境变量（用于 env 注入）
    user_envs = await env_storage.get_decrypted_vars(user_id)

    # 3. 逐个注册到 mcporter
    for server in sandbox_servers:
        if not server.command:
            continue

        # 构建 mcporter config add 命令
        env_args = ""
        if server.env_keys:
            env_parts = []
            for key in server.env_keys:
                if key in user_envs:
                    env_parts.append(f'--env {key}="${user_envs[key]}"')
            env_args = " ".join(env_parts)

        cmd = f'mcporter config add {server.name} --stdio "{server.command}"'
        if env_args:
            cmd += f" {env_args}"

        result = await backend.aexecute(cmd)
        if result.exit_code != 0:
            logger.error(
                f"[E2B] Failed to rebuild mcporter config for '{server.name}': {result.output}"
            )
```

#### E2B 暂停/恢复的影响

E2B 的 auto-pause 机制会**保留整个文件系统**（包括 `~/.mcporter/mcporter.json` 和 npm 缓存），因此：

| 场景 | mcporter config | npm 缓存 | 需要重建？ |
|---|---|---|---|
| 暂停 → 恢复 (auto-pause/resume) | ✅ 保留 | ✅ 保留 | 否 |
| 超时暂停 → 恢复 | ✅ 保留 | ✅ 保留 | 否 |
| 沙箱被 kill/销毁 | ❌ 丢失 | ❌ 丢失 | **是** |
| E2B 模板重建 | ❌ 丢失 | ❌ 丢失 | **是** |

> 结论：只有沙箱被**完全销毁**时才需要重建。E2B 的 pause/resume 不影响 mcporter 状态。

#### npm 缓存预热

`npx -y <package>` 首次运行需要下载包，可能导致首次工具调用超时。解决方案：

1. **后台预热**：重建完成后，异步执行 `npx -y <package> --version` 或 `mcporter list <server>` 触发下载
2. **E2B 模板预装**：在 `create_e2b_template.py` 中预装常用的 MCP 包（如 `firecrawl-mcp`、`@anthropic/mcp-server-fetch`）
3. **首次调用降级**：工具描述中提示 "首次调用可能较慢（需要下载 MCP 包）"，设置更长的超时

```python
async def _preheat_npm_cache(self, backend, server):
    """后台预热 npm 缓存，加速首次调用"""
    if not server.command or "npx" not in server.command:
        return
    # 后台执行，不阻塞主流程
    asyncio.create_task(self._do_preheat(backend, server))

async def _do_preheat(self, backend, server):
    try:
        await backend.aexecute(f'mcporter list {server.name} --json', timeout=120)
        logger.info(f"[E2B] Preheated mcporter cache for '{server.name}'")
    except Exception as e:
        logger.warning(f"[E2B] Preheat failed for '{server.name}': {e}")
```

#### mcporter daemon 模式（可选增强）

mcporter 支持 daemon 模式，可以保持 stdio MCP 服务器的长连接，避免每次调用都冷启动：

```bash
mcporter daemon start           # 启动 daemon
mcporter daemon status          # 查看状态
mcporter daemon stop            # 停止 daemon
```

在沙箱场景中，可以在重建完成后启动 daemon，让 MCP 服务器保持热状态。但这会增加沙箱资源占用，建议作为可选功能（通过配置开关控制）。

---

## 新建文件

### 1. `src/infra/tool/sandbox_mcp_tool.py` — Agent 工具

沙箱 MCP 管理工具，当沙箱内存在 `transport=sandbox` 的 MCP 服务器时注入到 Agent。

- `manage_sandbox_mcp(action, server_name?, command?, tool_name?, arguments?)` — 统一工具
  - `action="add"`: 在沙箱内安装并注册 MCP 服务器
    - 执行 `mcporter config add <name> --stdio "<command>"`
    - 注入用户环境变量（通过 `--env KEY=$KEY`）
    - 执行 `mcporter list <name> --json` 获取工具列表
    - 返回可用工具列表给 Agent
  - `action="list"`: 列出沙箱内所有 MCP 服务器的工具
    - 执行 `mcporter list --json`
    - 解析输出返回工具清单
  - `action="call"`: 调用沙箱内 MCP 工具
    - 执行 `mcporter call <server>.<tool> <args> --output json`
    - 解析并返回结果
  - `action="remove"`: 移除沙箱内 MCP 服务器
    - 执行 `mcporter config remove <name>`

- 通过 `ToolRuntime` 获取 sandbox backend，调用 `backend.aexecute()`

### 2. `src/infra/mcp/sandbox_discovery.py` — 沙箱 MCP 工具发现

独立的发现模块，在 Agent 初始化时：
1. 从 MongoDB 加载 `transport=sandbox` 的 MCP 配置
2. 确保沙箱已启动
3. 调用 `mcporter list --json` 发现实际可用工具
4. 返回工具列表（用于前端展示和 Agent 上下文）

## 修改文件

### 3. `scripts/create_e2b_template.py` — 安装 mcporter

在 E2B 模板构建脚本中添加：
```python
# 安装 Bun + mcporter（Bun 自包含，无需额外系统包）
template = template.run_cmd("curl -fsSL https://bun.sh/install | bash")
template = template.run_cmd("~/.bun/bin/bun install -g mcporter")

# 创建 mcporter 全局配置目录（确保存在）
template = template.run_cmd("mkdir -p ~/.mcporter")
```

同时在 `SYSTEM_PACKAGES` 中不需要额外系统包（Bun 自包含）。

### 4. `src/kernel/schemas/mcp.py` — 扩展传输类型

- `MCPTransport` 添加 `SANDBOX = "sandbox"`
- `MCPServerBase` 添加 sandbox 专用字段：
  ```python
  command: Optional[str] = Field(None, description="stdio 命令（sandbox 传输）")
  env_keys: Optional[list[str]] = Field(None, description="需要注入的环境变量 key 列表")
  ```
- `MCPServerCreate` / `MCPServerUpdate` 同步添加这些字段
- 添加校验：sandbox 类型必须提供 `command`

### 5. `src/kernel/types.py` — 添加权限

```python
MCP_WRITE_SANDBOX = "mcp:write_sandbox"
```

### 6. `src/kernel/schemas/permission.py` — 权限元数据

- `PERMISSION_METADATA` 添加 `mcp:write_sandbox` 的中文标签
- `PERMISSION_GROUPS_CONFIG` 的 MCP 分组中添加该权限

### 7. `src/infra/mcp/storage.py` — 支持 sandbox 字段

- `_doc_to_system_server()` / `_doc_to_user_server()` / `_doc_to_response()` 处理 `command` 和 `env_keys` 字段
- `_doc_to_config_dict()` 对 sandbox 类型返回 `{transport: "sandbox", command: ..., env_keys: ...}`
- `import_servers()` 支持 sandbox 类型导入
- 新增 `get_sandbox_servers(user_id)` 方法 — 返回用户所有 sandbox 类型 MCP
- `create_user_server()` 中也需存储 `command` 和 `env_keys` 字段（当前缺失）

### 8. `src/infra/tool/mcp_client.py` — sandbox 传输处理

`_create_mcp_client()` 中对 `sandbox` 类型的服务器**跳过外部连接**（由沙箱内 mcporter 处理），不创建 `langchain-mcp-adapters` 连接。

### 9. `src/api/routes/mcp.py` — 路由更新

- `_has_permission_for_transport()` 添加 sandbox 类型判断
- `discover_server_tools()` 对 sandbox 类型：调用 `sandbox_discovery.py` 在沙箱内执行 `mcporter list --json` 获取工具
- `create_server()` 响应中包含 `command` 和 `env_keys` 字段

### 10. `src/agents/search_agent/context.py` — 注入 sandbox MCP 工具

在 `setup()` 中，当 `ENABLE_SANDBOX` 且用户有 sandbox 类型 MCP 时：
```python
if settings.ENABLE_SANDBOX:
    sandbox_mcp_servers = await self._load_sandbox_mcp_configs()
    if sandbox_mcp_servers:
        self.tools.append(get_sandbox_mcp_tool(sandbox_mcp_servers))
```

### 11. `src/agents/fast_agent/context.py` — 同上

SearchAgent 和 FastAgent 都可能需要 sandbox MCP（如果启用了沙箱）。

### 12. `src/infra/sandbox/session_manager.py` — 沙箱重建钩子

在 `_create_and_bind_e2b()` 中添加 `_rebuild_sandbox_mcp()` 调用，详见[沙箱持久化方案](#沙箱持久化方案核心)。

## 前端文件

### 13. `frontend/src/types/mcp.ts` — 类型扩展

- `MCPTransport` 添加 `"sandbox"`
- `MCPServerBase` 添加 `command?: string`, `env_keys?: string[]`
- `MCPServerCreate` / `MCPServerUpdate` 同步

### 14. `frontend/src/components/mcp/MCPServerCard.tsx` — 显示 sandbox

- `TRANSPORT_LABELS` 添加 `sandbox: "Sandbox"`（蓝色 badge）
- `TRANSPORT_COLORS` 添加 sandbox 配色
- sandbox 类型显示 `command` 而非 `url`
- 显示 `env_keys` 标签（提示哪些环境变量会被注入）
- 沙箱未就绪时显示 "Sandbox not ready" 状态

### 15. `frontend/src/components/mcp/MCPServerForm.tsx` — 表单支持

- 添加 sandbox 传输选项（需要 `mcp:write_sandbox` 权限）
- 选择 sandbox 时：
  - 显示 `command` 输入框（如 `npx -y firecrawl-mcp`）
  - 显示 `env_keys` 多选/输入（提示用户哪些环境变量需要注入）
  - 隐藏 `url` 和 `headers` 字段
  - 提示信息：需要先在"环境变量"中配置对应的 API Key

### 16. `frontend/src/i18n/locales/zh.json` + `en.json` — 国际化

添加 sandbox 相关翻译：
- `mcp.form.transportSandbox` / `mcp.form.command` / `mcp.form.commandPlaceholder`
- `mcp.form.envKeys` / `mcp.form.envKeysPlaceholder` / `mcp.form.envKeysHint`
- `mcp.sandbox.notReady` / `mcp.sandbox.rebuilding`

---

## 关键设计决策

1. **不替换现有 MCP 系统**：sandbox MCP 与外部 SSE/HTTP MCP 并存，各走各的通道
2. **Agent 统一工具**：用一个 `manage_sandbox_mcp` 工具处理所有操作，避免工具膨胀
3. **环境变量桥接**：sandbox MCP 的 `env_keys` 引用用户在"环境变量"中已存的 key，沙箱已有这些变量，mcporter 命令通过 `$KEY` 引用
4. **工具发现走 API**：前端的"发现工具"按钮调用后端 API，后端在沙箱内执行 `mcporter list`，结果返回前端
5. **持久化在 MongoDB**：sandbox MCP 配置存在 MongoDB（和外部 MCP 一样的集合），重建沙箱时自动重装
6. **声明式重建**：MongoDB 是唯一数据源，沙箱内容是衍生状态，任何新建沙箱都从 MongoDB 重建
7. **非阻塞重建**：sandbox MCP 重建失败不阻塞沙箱创建，仅记录 warning

## 实现顺序

### Phase 1: 基础设施（后端）

| 步骤 | 文件 | 说明 |
|---|---|---|
| 1 | `src/kernel/types.py` | 添加 `MCP_WRITE_SANDBOX` 权限枚举 |
| 2 | `src/kernel/schemas/permission.py` | 添加权限元数据 |
| 3 | `src/kernel/schemas/mcp.py` | 扩展传输类型、添加 `command`/`env_keys` 字段、sandbox 校验 |
| 4 | `src/infra/mcp/storage.py` | sandbox 字段完整存取、`create_user_server` 存 command/env_keys、`get_sandbox_servers()` |
| 5 | `src/api/routes/mcp.py` | 权限判断、discover 路由支持 sandbox |
| 6 | `src/infra/tool/mcp_client.py` | `_create_mcp_client()` 跳过 sandbox 类型 |

### Phase 2: 沙箱集成

| 步骤 | 文件 | 说明 |
|---|---|---|
| 7 | `scripts/create_e2b_template.py` | 安装 Bun + mcporter |
| 8 | `src/infra/sandbox/session_manager.py` | `_rebuild_sandbox_mcp()` 声明式重建 |
| 9 | `src/infra/tool/sandbox_mcp_tool.py` | Agent 工具（add/list/call/remove） |
| 10 | `src/infra/mcp/sandbox_discovery.py` | 工具发现模块 |
| 11 | `src/agents/search_agent/context.py` | 注入 sandbox MCP 工具 |
| 12 | `src/agents/fast_agent/context.py` | 同上 |

### Phase 3: 前端

| 步骤 | 文件 | 说明 |
|---|---|---|
| 13 | `frontend/src/types/mcp.ts` | 类型扩展 |
| 14 | `frontend/src/components/mcp/MCPServerCard.tsx` | sandbox badge + 状态显示 |
| 15 | `frontend/src/components/mcp/MCPServerForm.tsx` | 表单支持 command/env_keys |
| 16 | `frontend/src/i18n/locales/*.json` | 国际化 |

## 验证方式

### 基本功能

1. 创建 sandbox 类型 MCP 服务器（command: `npx -y @anthropic/mcp-server-fetch`）
2. 前端 MCPPanel 显示蓝色 "Sandbox" badge
3. 点击"发现工具"按钮，沙箱内安装并返回工具列表
4. Agent 会话中可调用沙箱内 MCP 工具
5. 环境变量（如 `FIRECRAWL_API_KEY`）通过 `env_keys` 正确注入

### 沙箱持久化

6. 销毁沙箱 → 重新创建 → 验证 mcporter config 自动重建
7. 暂停沙箱 → 恢复 → 验证 mcporter config 仍存在（无需重建）
8. 创建新沙箱 → 验证 npm 缓存预热（首次调用不超时）

### 边界情况

9. 沙箱不可用时，前端显示 "Sandbox not ready" 提示
10. mcporter config add 失败时，记录 warning 但不阻塞
11. env_keys 引用的环境变量不存在时，工具调用返回明确错误

---

## 当前实现状态

### 已完成 ✅

| 项目 | 文件 | 状态 |
|---|---|---|
| `MCPTransport.SANDBOX` 枚举 | `src/kernel/schemas/mcp.py` | ✅ 已添加 |
| `command` / `env_keys` 字段 | `MCPServerBase`, `MCPServerUpdate`, `SystemMCPServer`, `UserMCPServer` | ✅ 已添加 |
| MongoDB 读写 `command`/`env_keys` | `_doc_to_system_server()`, `_doc_to_user_server()`, `_doc_to_response()`, `create_system_server()` | ✅ 已支持 |
| sandbox 跳过 langchain 连接 | `mcp_client.py:350-361` | ✅ 已跳过（日志 "unsupported transport"） |

### 待实现 🔲

| 项目 | 文件 | 状态 |
|---|---|---|
| `create_user_server()` 存 command/env_keys | `storage.py:222-247` | 🔲 缺失（doc 中未写入 command/env_keys） |
| `_doc_to_config_dict()` sandbox 类型 | `storage.py:940-953` | 🔲 缺失 |
| `update_user_server()` 支持 command/env_keys | `storage.py:249-278` | 🔲 缺失 |
| `_has_permission_for_transport()` sandbox | `api/routes/mcp.py:46-65` | 🔲 缺失 |
| `MCPServerResponse` 含 command/env_keys | `api/routes/mcp.py` 各响应构造 | 🔲 缺失（`create_server` 响应未包含） |
| `get_sandbox_servers()` 方法 | `storage.py` | 🔲 缺失 |
| `MCP_WRITE_SANDBOX` 权限 | `types.py`, `permission.py` | 🔲 缺失 |
| mcporter 安装 | `create_e2b_template.py` | 🔲 缺失 |
| sandbox MCP 工具 | `sandbox_mcp_tool.py` | 🔲 缺失 |
| sandbox 工具发现 | `sandbox_discovery.py` | 🔲 缺失 |
| 声明式重建 | `session_manager.py` | 🔲 缺失 |
| Agent 注入 | `search_agent/context.py`, `fast_agent/context.py` | 🔲 缺失 |
| 前端类型 | `frontend/src/types/mcp.ts` | 🔲 缺失 |
| 前端表单 | `MCPServerForm.tsx` | 🔲 缺失 |
| 前端卡片 | `MCPServerCard.tsx` | 🔲 缺失 |
| 国际化 | `zh.json`, `en.json` | 🔲 缺失 |
