# LLM 配置

控制 LambChat 与语言模型交互方式的设置。

## 模型提供商密钥

这些变量由底层 LLM SDK 库直接使用（不经过 Settings 类）。当模型未在模型配置 UI 中设置 API Key 时，它们作为回退凭据使用：

| 变量名 | 说明 |
|--------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥（由 `langchain-anthropic` 使用） |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic Bearer Token，`ANTHROPIC_API_KEY` 的替代项 |
| `ANTHROPIC_BASE_URL` | Anthropic 兼容的 API 基础 URL |
| `GOOGLE_API_KEY` | Google Gemini API 密钥（由 `langchain-google-genai` 使用） |

::: tip
LambChat 支持通过 UI 进行多模型管理。模型及其 API Key 在模型配置 UI 中设置；以上环境变量仅作为提供商 SDK 的回退凭据。
:::

## 重试与缓存设置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DEFAULT_MODEL_ID` | _(空)_ | 管理员设置的新会话和后台任务默认模型配置 ID。空 = 第一个启用模型。 |
| `LLM_MAX_RETRIES` | `3` | 超时、网络、限流和 5xx 失败后追加的重试次数。`3` 表示最多调用 4 次。 |
| `LLM_RETRY_DELAY` | `1.0` | 首次重试等待时间（秒，后续指数退避）。 |
| `LLM_REQUEST_TIMEOUT` | `120` | 流式首事件或完整非流式响应的最长等待秒数；首事件到达后不限制流式总时长。 |
| `LLM_MODEL_CACHE_SIZE` | `50` | 模型实例缓存大小。防止重复实例化导致的内存泄漏。 |

## DeepAgent 上下文设置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DEEPAGENT_DEFAULT_MAX_INPUT_TOKENS` | `64000` | DeepAgent 默认最大输入 token 数。 |

## 示例

```bash
# .env
ANTHROPIC_API_KEY=sk-your-api-key
LLM_MAX_RETRIES=3
LLM_RETRY_DELAY=1.0
LLM_REQUEST_TIMEOUT=120
LLM_MODEL_CACHE_SIZE=50
```
