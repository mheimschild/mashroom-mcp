# mashroom-mcp-services

MCP server, tool registry, and HTTP transport layer for the Mashroom MCP Service.

## Purpose

Provides two Mashroom plugins:

1. **Mashroom MCP API** (`api` type) — Exposes the `/mcp` endpoint with Streamable HTTP transport. Manages per-session `McpServer` instances, security middleware, and session lifecycle.
2. **Mashroom MCP Tool Registry** (`services` type) — Publishes the tool registration service under the `"Mashroom MCP Tool Registry"` namespace so other plugins (like `mashroom-mcp-tools-loader`) can register tools at runtime.

## Files

| File | Purpose |
|------|---------|
| `src/MCPServer.ts` | Core MCP server management: per-session servers, tool storage/replay, authorization checks, session TTL, audit logging |
| `src/MCPRouter.ts` | Express router with Streamable HTTP transport. Middleware stack: CORS → Rate Limit → Security Context → Transport handler |
| `src/MashroomMCPAPI.ts` | Plugin entry point. Creates server, wires up router, initializes security loggers, starts session cleanup interval |
| `src/mashroom-bootstrap-api.ts` | Bootstrap function for the API plugin. Instantiates `MashroomMCPAPI` and stores it on the context holder for cross-bundle access |
| `src/mcp-tool-registry.ts` | Bootstrap for the services plugin. Retrieves the API from context holder and exposes it as a service |

## Configuration

Override in root `mashroom.json` under `plugins."Mashroom MCP API"`:

| Property | Default | Description |
|----------|---------|-------------|
| `sessionTTL` | `1800` (30 min) | Idle timeout for MCP sessions in seconds. Expired sessions are cleaned every 5 minutes. |
| `rateLimitMaxRequests` | `120` | Max requests per IP within the rate limit window |
| `rateLimitWindowMs` | `60000` (1 min) | Rate limit sliding window in milliseconds |
| `allowedOrigins` | `[]` | Allowed CORS origins. Empty = same-origin only. `["*"]` = allow all. |

## Security Middleware Stack

Applied in order on every `/mcp` request:

1. **CORS** — Validates `Origin` header against `allowedOrigins`. Handles OPTIONS preflight.
2. **Rate Limiting** — Per-IP sliding window counter. Returns 429 when exceeded. Sets `X-RateLimit-*` headers.
3. **Security Context** — Extracts user roles from Mashroom's plugin context on the request and associates them with the MCP session ID for tool-level authorization.

## Session Management

Each MCP client gets a dedicated per-session `McpServer` instance. Sessions are identified by UUID (in the `Mcp-Session-Id` header) and track:

- **Activity timestamp** — Updated on every request and tool call
- **User roles** — Extracted from Mashroom security context for authorization
- **TTL** — Sessions exceeding idle timeout are cleaned up by a 5-minute interval in `MashroomMCPAPI`

## Tool Registration Flow

```
mashroom-mcp-tools-loader.load(plugin)
    → calls plugin bootstrap → getTool(config, contextHolder)
    → calls registrationService.registerTool(pluginName, toolName, config, callback)
    → MCPServer stores definition + wraps callback with auth check
    → replays onto all active per-session McpServer instances
```

When a new session connects, `replayTools()` registers all stored tools onto the new server with session-scoped authorization wrappers.

## Audit Logging

Two logger categories are used:

- **`mashroom.mcp.audit`** — Tool invocations (`TOOL_CALL`, `TOOL_OK`, `TOOL_ERROR`), session expiration
- **`mashroom.mcp.auth`** — Authorization denials with reason

Configure log4js appenders for these categories to capture security-relevant events.

## MCP Transport Protocol

| HTTP Method | Purpose |
|-------------|---------|
| `POST /mcp` | Initialize session (no `Mcp-Session-Id`) or send JSON-RPC (with header). Body limit: 10MB. |
| `GET /mcp` | Subscribe to server-to-client SSE notifications for the session |
| `DELETE /mcp` | Explicitly terminate session and clean up resources |

## Build

```bash
npm run build    # Rsbuild → dist/index.js, dist/mcp-tool-registry.js
npm run check    # Biome lint + fix
npm run format   # Biome format
```
