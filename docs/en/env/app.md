# Application Settings

Basic application configuration for the LambChat server.

::: tip Configuration priority
Database-backed settings have higher priority than environment variables at runtime. Environment variables are imported only for settings that are not already present in the database, and remain fallback values when no database setting exists.
:::

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `false` | Enable debug/reload mode. Sets log verbosity and enables hot reload in development. |
| `HOST` | `0.0.0.0` | Server bind host. Use `127.0.0.1` to restrict to localhost only. |
| `PORT` | `8000` | Server bind port. |
| `APP_BASE_URL` | _(empty)_ | Base URL for generating file URLs. **Required when using a reverse proxy.** Example: `https://lambchat.example.com` |
| `APP_NAME` | `LambChat` | Application name (read-only, hardcoded). |
| `APP_VERSION` | _(auto)_ | Auto-read from `pyproject.toml` at startup. |
| `LOG_LEVEL` | `INFO` | Logging level. Options: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. |

## Example

```bash
# .env
DEBUG=false
HOST=0.0.0.0
PORT=8000
APP_BASE_URL=https://lambchat.example.com
LOG_LEVEL=INFO
```

::: tip
When deploying behind a reverse proxy (nginx, Traefik, Cloudflare Tunnel), always set `APP_BASE_URL` to the public-facing URL. This ensures file upload URLs, sharing links, and OAuth callbacks work correctly.
:::
