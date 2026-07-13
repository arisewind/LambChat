# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

LambChat 是一个全栈 AI Agent 平台，支持构建、运行和共享能完成实际工作的 Agent。

**技术栈：**
- 后端：Python 3.12+、FastAPI、LangGraph/deepagents、MongoDB、Redis、arq
- 前端：React 19、TypeScript、Vite、TailwindCSS、PWA
- 客户端：Capacitor（移动端）、Tauri（桌面端）
- 文档：VitePress

## 常用命令

### 依赖安装
```bash
make install-all      # 安装所有依赖（Python + 前端 + pre-commit hooks）
make install          # 仅安装 Python 依赖（使用 uv）
make frontend-install # 仅安装前端依赖（使用 pnpm）
```

### 开发运行
```bash
make dev-all          # 同时启动前后端开发服务器
make dev              # 仅启动后端（http://127.0.0.1:8000）
make frontend-dev     # 仅启动前端（http://127.0.0.1:3001）
```

### 构建与部署
```bash
make build-all        # 构建前后端
make frontend-build   # 构建前端生产版本

# Docker 部署
cd deploy
cp .env.example .env
docker compose up -d
```

### 代码质量检查
```bash
make lint             # Ruff 代码检查
make format           # Ruff 代码格式化
make typecheck        # Mypy 类型检查
make test             # 运行所有测试
make check-all        # 运行所有检查（pre-commit + typecheck + test + build）

# 前端专用
cd frontend && pnpm run lint          # ESLint 检查
cd frontend && pnpm test             # Vitest 单次运行
cd frontend && pnpm test:watch        # Vitest watch 模式（TDD 开发核心命令）
cd frontend && pnpm test:coverage    # 带覆盖率报告
```

## 代码架构

### 后端分层结构

```
src/
├── agents/          # Agent 图执行层
│   ├── core/        # BaseGraphAgent 基类、GraphBuilder、注册机制
│   ├── fast_agent/  # 快速 Agent
│   ├── search_agent/# 搜索 Agent
│   └── team_agent/  # 团队 Agent
├── api/             # FastAPI 路由层
│   └── routes/      # 按功能分模块（chat、auth、mcp、skills 等）
├── infra/           # 基础设施服务层
│   ├── agent/       # Agent 事件处理、任务管理
│   ├── auth/        # 认证授权
│   ├── llm/         # LLM 客户端
│   ├── mcp/         # MCP 工具管理
│   ├── storage/     # 存储（MongoDB、S3、checkpointer）
│   └── task/        # 后台任务管理（arq）
├── kernel/          # 共享内核（无依赖）
│   ├── config.py    # 全局配置定义
│   ├── schemas/     # Pydantic 模型
│   └── types.py     # 类型定义
└── skills/          # 内置技能
```

### 前端结构

```
frontend/src/
├── components/      # React 组件
│   ├── agent/       # Agent 选择器、模型配置
│   ├── chat/        # 聊天界面、消息渲染、工具面板
│   ├── panel/       # MCP、技能、文件等侧边面板
│   └── pages/       # 页面组件
├── services/        # API 客户端、浏览器服务
├── stores/          # 状态管理
├── i18n/            # 国际化文件
└── workers/         # PWA Worker
```

### Agent 执行流程

1. **请求接入** → API 路由接收消息，创建 `Presenter`
2. **Graph 执行** → Agent 通过 `BaseGraphAgent.stream()` 执行 LangGraph
3. **事件处理** → `AgentEventProcessor` 将 LangGraph 事件转换为 SSE 事件
4. **实时推送** → 通过 SSE/WebSocket 推送到前端
5. **状态持久化** → Checkpointer 保存到 MongoDB/PostgreSQL

### 关键设计模式

- **Agent 注册**：使用 `@register_agent("id")` 装饰器注册，通过 `AgentFactory.get()` 获取单例
- **Presenter 模式**：Agent 节点通过 `config["configurable"]["presenter"]` 输出 SSE 事件
- **Checkpointer**：LangGraph 状态持久化，支持 MongoDB（默认）和 PostgreSQL
- **任务队列**：arq 后台任务，支持本地和 Redis 执行

## 开发约定

### TDD 开发流程

**核心原则：没有失败的测试，就不要写生产代码。**

```
1. RED    — 写一个失败的测试，描述期望行为
2. GREEN   — 写最少的生产代码让测试通过
3. REFACTOR — 在测试保护下清理和优化
```

**前端 TDD 命令：**
```bash
cd frontend && pnpm test:watch  # Watch 模式，TDD 开发核心命令
```

**测试位置：**
- 前端：`frontend/src/**/__tests__/*.test.{ts,tsx}`
- 后端：`tests/`（镜像 `src/` 结构）

### Agent 开发

创建新 Agent：

```python
from src.agents.core import BaseGraphAgent, register_agent

@register_agent("my_agent")
class MyAgent(BaseGraphAgent):
    _agent_name = "My Agent"
    _description = "Description"
    _sort_order = 100

    def build_graph(self, builder):
        builder.add_node("agent", self.agent_node)
        builder.set_entry_point("agent")
        builder.add_edge("agent", END)

    async def agent_node(self, state, config):
        presenter = config["configurable"]["presenter"]
        presenter.present_text("Hello")
        return {"output": "done"}
```

### 环境配置

**必须配置的密钥（生产环境）：**
```bash
JWT_SECRET_KEY=              # JWT 签名密钥
MCP_ENCRYPTION_SALT=         # MCP 配置加密盐
```

**可选但推荐：**
```bash
MONGODB_URL=mongodb://localhost:27017
REDIS_URL=redis://localhost:6379/0
```

LLM 模型通过 **Model Config UI** 配置，无需在环境变量中设置 API Key（除非需要独立的标题生成模型）。

### 敏感路径注意事项

以下路径需要保守变更：
- 认证/授权（`src/infra/auth/`）
- RBAC 权限（`src/infra/role/`）
- MCP 配置加密（`src/infra/mcp/`）
- 文件访问控制（`src/infra/upload/`、`src/infra/storage/`）
- Sandbox 执行（`src/infra/sandbox/`）

## 验证指南

根据变更范围选择最小验证方式：

| 变更类型 | 验证命令 |
|----------|----------|
| 前端逻辑 | `cd frontend && pnpm test` |
| 前端组件 | `cd frontend && pnpm test && cd frontend && pnpm run build` |
| 前端格式/类型 | `cd frontend && pnpm run lint && cd frontend && pnpm run build` |
| 后端逻辑 | `uv run pytest`（相关测试） |
| 后端格式/类型 | `make lint && make typecheck` |
| 跨栈变更 | `make check-all` |

## 开发地址

`make dev-all` 启动：
- 后端：http://127.0.0.1:8000
- 前端：http://127.0.0.1:3001
