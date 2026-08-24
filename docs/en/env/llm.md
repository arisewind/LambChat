# LLM Configuration

Settings for controlling how LambChat interacts with language models.

## Model Provider Keys

These are consumed by the underlying LLM SDK libraries directly (not by the Settings class). They serve as fallback credentials when a model has no API key configured in the Model Config UI:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (consumed by `langchain-anthropic`) |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic bearer token, alternative to `ANTHROPIC_API_KEY` |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible API base URL |
| `GOOGLE_API_KEY` | Google Gemini API key (consumed by `langchain-google-genai`) |

::: tip
LambChat supports multi-model management through the UI. Models and their API keys are configured in the Model Config UI; the env vars above only act as fallback credentials for provider SDKs.
:::

## Retry & Cache Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_MODEL_ID` | _(empty)_ | Admin model configuration ID used as the default for new sessions and background jobs. Empty = first enabled model. |
| `LLM_MAX_RETRIES` | `3` | Retries after the initial call for timeout, network, rate-limit, and 5xx failures. `3` means up to 4 attempts. |
| `LLM_RETRY_DELAY` | `1.0` | Initial retry delay in seconds (exponential backoff). |
| `LLM_REQUEST_TIMEOUT` | `120` | Seconds allowed for the first streaming event or a complete non-streaming response. Streaming has no total duration limit after its first event. |
| `LLM_MODEL_CACHE_SIZE` | `50` | Model instance cache size. Prevents memory leaks from repeated instantiation. |

## DeepAgent Context Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPAGENT_DEFAULT_MAX_INPUT_TOKENS` | `64000` | Default max input tokens for DeepAgent. |

## Example

```bash
# .env
ANTHROPIC_API_KEY=sk-your-api-key
LLM_MAX_RETRIES=3
LLM_RETRY_DELAY=1.0
LLM_REQUEST_TIMEOUT=120
LLM_MODEL_CACHE_SIZE=50
```
