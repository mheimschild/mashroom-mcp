# Mashroom MCP Service

A **Mashroom Server** plugin-based project that exposes [Mashroom Portal](https://www.mashroom-server.com/documentation/docs/html/#mashroomportal) management capabilities as **MCP (Model Context Protocol)** tools. This allows LLM agents (via LangChain, Claude Desktop, Cursor, etc.) to query and manage portal sites, pages, apps, themes, layouts, and plugin configurations through a standardized tool-calling interface.

## Architecture

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  MCP Client   │────▶│  mashroom-mcp-services  │────▶│  Mashroom Portal │
│  (LLM Agent)  │     │  /mcp endpoint          │     │  Service API     │
└──────────────┘     └────────┬─────────────┘     └──────────────────┘
                              │
                    ┌─────────▼────────────────┐
                    │  mashroom-mcp-tools-loader    │  loads "mashroom-mcp-tool-plugin"
                    │  (plugin-loader)              │  type plugins from:
                    └─────────┬────────────────┘    │  - mashroom-mcp-tool-plugins/
                              │                     │  - mashroom-mcp-tool-metrics/
                    ┌─────────▼────────────────┐
                    │  mashroom-mcp-tool-plugins   │  21 MCP tool definitions:
                    │                             │  sites, pages, apps, plugins…
                    ├────────────────────────────┤
                    │  mashroom-mcp-tool-metrics  │  5 MCP metric tools:
                    │                             │  list/get/search metrics
                    └─────────────────────────────┘

┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Web Browser  │────▶│  mashroom-mcp-portal-chat-app  │────▶│ mashroom-mcp-chat-api   │
│  (Chat UI)    │     │  /portal page           │     │  /chat endpoint   │
└──────────────┘     └──────────────────────┘     │  (LangChain+Ollama)│
                                                   └────────┬──────────┘
                                                            │
                                                   ┌────────▼─────────┐
                                                   │    mashroom-mcp-services   │
                                                   │      /mcp         │
                                                   └──────────────────┘
```

## Tool Propagation Flow

How tools defined in `mashroom-mcp-tool-plugins` end up callable on the MCP server. Three plugins chain together via Mashroom's dependency system, with a services-namespace bridge carrying tool registrations from loader to server.

### Load order (enforced by `requires` in each `mashroom.json`)

```
1. Mashroom MCP API          (type: api,        mashroom-mcp-services)
       ↓ requires
2. Mashroom MCP Tool Registry (type: services,   mashroom-mcp-services)
       ↓ requires
3. Mashroom MCP Tool Plugin Loader  (type: plugin-loader, mashroom-mcp-tools-loader)
```

### Step-by-step propagation

**1. `Mashroom MCP API` bootstraps** (`mashroom-bootstrap-api.ts`)

Creates a `MashroomMCPAPI` instance and stores it on the shared `pluginContextHolder` under the string key `'__mashroom_mcp_api__'`. A string key (not `Symbol`) is used because the API bootstrap (`dist/index.js`) and services bootstrap (`dist/mcp-tool-registry.js`) are **separate bundles** — each would get its own `Symbol` instance, making cross-bundle lookup impossible.

```typescript
pluginContextHolder['__mashroom_mcp_api__'] = new MashroomMCPAPI(...)
```

**2. `Mashroom MCP Tool Registry` bootstraps** (`mcp-tool-registry.ts`)

Reads the API from the same contextHolder via `getRegistrationService()`, and publishes it as a **Mashroom service** under the namespace `"mcp"`:

```typescript
return { mcpApi: registrationService };  // → MashroomMCPAPI instance
```

Other plugins look this up by namespace through the standard Mashroom services mechanism.

**3. `mashroom-mcp-tools-loader` bootstraps** (`index.ts`)

Looks up the `"mcp"` service and injects its `mcpApi` into the `MCPToolLoader`:

```typescript
const registryServices = services['Mashroom MCP Tool Registry'];
loader.setRegistrationService(registryServices.mcpApi);  // ← MashroomMCPAPI
```

**4. When a tool plugin is loaded** (`pluginLoader.ts` → `load()`)

The loader calls the tool plugin's `getTool()` to get its descriptor (callback + schemas), then forwards it through the registration service:

```typescript
this._registrationService.registerTool(
  pluginName,                                       // e.g. "insert_site"
  toolName,                                         // e.g. "insert_site" (derived)
  { title, description, inputSchema, outputSchema, category, access },
  tool.callback,
);
```

**5. `MashroomMCPAPI.registerTool()` delegates to `MCPServer`** (`MashroomMCPAPI.ts`)

```typescript
registerTool(...) → registerToolFromPlugin(pluginName, toolName, config, callback)
```

**6. `registerToolFromPlugin()` in `MCPServer.ts` does the actual work:**

- Stores the definition in `storedToolDefinitions` (global map — persists independently of sessions)
- Removes any existing tool with the same name from all active servers
- Enriches config with `_meta.access`
- Registers the tool on **all currently active per-session McpServer instances** via `server.registerTool()`, wrapping each callback with auth checking (`createAuthWrappedCallback`)

### Two-phase registration

Tools are stored globally in `storedToolDefinitions` and replayed onto each per-session McpServer when it's created (via `replayTools()`). This means a tool plugin loaded at any time becomes available to all existing **and** future sessions.

```
mashroom-mcp-tools-loader/pluginLoader.ts::load()
  │
  ├─ plugin.getTool(config, contextHolder)   → MCPToolDescriptor { callback, inputSchema, ... }
  │
  └─ this._registrationService.registerTool(pluginName, toolName, config, callback)
       │        ↑
       │        is MashroomMCPAPI (from services namespace "mcp")
       │
       ├─ mashroom-mcp-services/MashroomMCPAPI.ts::registerTool()
       │    │
       │    └─ MCPServer.ts::registerToolFromPlugin()
       │         ├─ storedToolDefinitions.set(toolName, def)     ← global store
       │         └─ for each activeServer:                        ← live registration
       │              server.registerTool(name, config, wrappedCallback)
       │
       └─ Tool is now available on all active MCP sessions + any future sessions
            (replayed via replayTools() on new server creation)
```

## Packages

| Package | Purpose | Mashroom Plugin Type |
|---------|---------|---------------------|
| **mashroom-mcp-services** | MCP server & tool registry. Handles `/mcp` endpoint, session management, security middleware | `api`, `services` |
| **mashroom-mcp-tools-loader** | Custom plugin loader for `mashroom-mcp-tool-plugin` type plugins | `plugin-loader` |
| **mashroom-mcp-tool-plugins** | 21 MCP tool implementations (sites, pages, apps, plugins, etc.) | `mashroom-mcp-tool-plugin` |
| **mashroom-mcp-tool-metrics** | 5 MCP metric tools (list/get/search metrics from the monitoring collector) | `mashroom-mcp-tool-plugin` |
| **mashroom-mcp-chat-api** | LangChain agent + Ollama LLM chat endpoint at `/chat`. Connects to `/mcp` for tools | `api` |
| **mashroom-mcp-portal-chat-app** | React chat UI portal app. Renders in a Mashroom Portal page | `portal-app` |
| **mashroom-mcp-skill** | Rust CLI client for MCP tools (standalone, not a Mashroom plugin) | N/A |

## Monorepo Setup

This project uses **pnpm workspaces** for dependency management. All packages live under `packages/` and share a single `node_modules/` at the root via pnpm's content-addressable store (symlinks, no duplication).

```bash
# Install all dependencies (once)
pnpm install

# Build all packages
pnpm build

# Run a command in a specific package
pnpm --filter mashroom-mcp-services build

# Add a dependency to a specific package
pnpm add express --filter mashroom-mcp-services

# Add a dev dependency to a specific package
pnpm add -D typescript --filter mashroom-mcp-services

# Add a dependency to all packages
pnpm add zod -r
```

### Workspace Scripts

Root `package.json` exposes convenience scripts that run across all packages:

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm check` | Lint all packages (Biome) |
| `pnpm check:fix` | Lint + auto-fix all packages |
| `pnpm format` | Format all packages |
| `pnpm type-check` | Type-check all packages |
| `pnpm test` | Run tests (mashroom-mcp-tools-loader) |

### Package Cross-References

To depend on another workspace package, use the package name directly in `dependencies`:

```json
{
  "dependencies": {
    "mashroom-mcp-services": "workspace:*"
  }
}
```

## MCP Skill CLI

The **mashroom-mcp-skill** package is a standalone Rust CLI for calling MCP tools from the command line. It handles the full MCP lifecycle (initialize → call tool → extract output).

### Build

```bash
cd packages/mashroom-mcp-skill && cargo build
```

Binary at `packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill`.

### Usage

```bash
# Via cargo run (from project root)
cargo run -p mashroom-mcp-skill -- portal-sites

# Via binary
./packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill get-site --site-id "main-site"

# Custom server URL
./packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill -u http://my-server:8080/mcp list-plugins
```

### Authentication

Two authentication methods are supported. **Bearer token takes priority** if both are provided.

#### Method 1: Bearer Token (OAuth2 / API key)

Sends `Authorization: Bearer <token>` on every request.

```bash
# Via CLI flag
./packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill -t "your-token" portal-sites

# Via environment variable
export MCP_AUTH_TOKEN="your-token"
./packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill portal-sites
```

#### Method 2: Login Form (username/password)

Logs in via `POST /login` to obtain a session cookie, which is then sent with all MCP requests.

```bash
# Via CLI flags
./packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill --username admin --password admin portal-sites

# Via environment variables
export MCP_USERNAME="admin"
export MCP_PASSWORD="admin"
./packages/mashroom-mcp-skill/target/debug/mashroom-mcp-skill portal-sites
```

### Commands

| Command | Description |
|---------|-------------|
| `portal-sites` | List all registered portal sites |
| `get-site --site-id <id>` | Get full site details |
| `update-site --site-id <id> [--title ...]` | Update a site |
| `insert-site --new-site-id <id> --new-title <t> --new-path <p>` | Create a new site |
| `site-pages --site-path <path>` | List pages in a site |
| `get-page --page-id <id>` | Get full page details |
| `update-page --page-id <id> [--title ...]` | Update a page |
| `insert-page --site-path <p> --new-page-id <id> --new-title <t>` | Create a new page |
| `get-app-instance --plugin-name <name>` | Get app instance config |
| `update-app-instance --plugin-name <name> --app-config-json <json>` | Update app instance |
| `portal-apps` | List all portal apps |
| `portal-themes` | List all themes |
| `portal-layouts` | List all layouts |
| `page-enhancements` | List page enhancement plugins |
| `app-enhancements` | List app enhancement plugins |
| `list-plugins` | List all server plugins |
| `get-plugin --plugin-name <name>` | Get plugin details |
| `list-plugin-packages` | List npm plugin packages |
| `get-plugin-package --package-name <name>` | Get package details |
| `list-plugin-loaders` | List registered plugin loaders |
| `plugins-by-type --plugin-type <type>` | Filter plugins by type |

## Quick Start

```bash
# Install dependencies for all packages (once)
pnpm install

# Build all packages
pnpm build

# Start the testserver
pnpm --filter mashroom-mcp-service dev
```

The server starts at **http://localhost:5051**.

- MCP endpoint: `http://localhost:5051/mcp`
- Chat API: `http://localhost:5051/chat`
- Portal UI: `http://localhost:5051/portal`

> **Tip:** The `packages/testserver/` directory contains a ready-to-run Mashroom server with all MCP plugins wired up. Use `pnpm --filter mashroom-mcp-service dev` from the project root to start it.

## Configuration

### mashroom.json (root)

Main server configuration. Key settings:

| Property | Default | Description |
|----------|---------|-------------|
| `port` | `5051` | HTTP port |
| `enableHttp2` | `false` | Enable HTTP/2 |
| `pluginPackageFolders` | — | Directories containing Mashroom plugins (devMode enables hot-reload) |
| `plugins."Mashroom Security Simple Provider".users` | `./users.json` | Path to user definitions file |
| `plugins."Mashroom Security Simple Provider".loginPage` | `/login` | Login page path |
| `plugins."Mashroom Security Simple Provider".authenticationTimeoutSec` | `300` | Session timeout in seconds |

### MCP API Configuration (`packages/mashroom-mcp-services/mashroom.json`)

Override defaults in the root `mashroom.json` under `plugins`:

```json
{
  "plugins": {
    "Mashroom MCP API": {
      "sessionTTL": 1800,
      "rateLimitMaxRequests": 120,
      "rateLimitWindowMs": 60000,
      "allowedOrigins": ["http://localhost:3000"]
    }
  }
}
```

| Property | Default | Description |
|----------|---------|-------------|
| `sessionTTL` | `1800` (30 min) | MCP session idle timeout in seconds. Expired sessions are cleaned up every 5 minutes. |
| `rateLimitMaxRequests` | `120` | Max requests per IP within the rate limit window |
| `rateLimitWindowMs` | `60000` (1 min) | Rate limit sliding window in milliseconds |
| `allowedOrigins` | `[]` (same-origin only) | Allowed CORS origins. Use `["*"]` to allow all. Empty array = same-origin only. |

### ACL (`acl.json`)

Access control rules for URL paths:

```json
{
  "/mcp/**": {
    "*": { "allow": { "roles": ["Authenticated"] } }
  },
  "/chat/**": {
    "*": { "allow": { "roles": ["Authenticated"] } }
  },
  "/api/**": {
    "*": { "allow": "any" }
  },
  "/portal/**": {
    "*": { "allow": { "roles": ["Authenticated"] } }
  },
  "/mashroom/**": {
    "*": { "allow": { "roles": ["Authenticated"], "ips": ["127.0.0.1", "::1"] } }
  }
}
```

| Path | HTTP Methods | Access Rule |
|------|-------------|-------------|
| `/mcp/**` | `*` | Public (tool-level authorization enforces access control) |
| `/chat/**` | `*` | Authenticated users only |
| `/api/**` | `*` | Public (all other API endpoints) |
| `/portal/**` | `*` | Authenticated users only |
| `/mashroom/**` | `*` | Authenticated + localhost IP only |

### Users (`users.json`)

Defines users with SHA-256 password hashes and roles. Default users:

| Username | Roles | Description |
|----------|-------|-------------|
| `admin` | `Administrator` | Full access to all tools including write/admin |
| `john` | `Role2`, `Role5` | Read-only access |

Generate a password hash with: `echo -n 'yourpassword' | shasum -a 256` (macOS) or `echo -n 'yourpassword' | sha256sum` (Linux).

### Tool Access Configuration (`packages/mashroom-mcp-tool-plugins/mashroom.json`)

Each tool defines an `access` object in its `defaultConfig`:

```json
{
  "name": "insert_site",
  "defaultConfig": {
    "access": {
      "type": "admin",
      "roles": ["Administrator"]
    }
  }
}
```

| Access Type | Required Roles (if no explicit `roles`) | Description |
|-------------|----------------------------------------|-------------|
| `read` | `Authenticated` | Read-only data queries |
| `write` | `Authenticated` + any explicitly listed roles | Modifies existing data |
| `admin` | `Administrator` + any explicitly listed roles | Creates/deletes resources |

## Security Features

1. **ACL** — `/mcp` and `/chat` require authentication. `/api/**` is public for other endpoints.
2. **Tool-Level Authorization** — Each tool declares an access type (`read`/`write`/`admin`) and optional required roles. Write and admin tools enforce role checks before execution.
3. **Session TTL** — MCP sessions expire after 30 minutes of inactivity. A background cleanup runs every 5 minutes.
4. **Rate Limiting** — Per-IP sliding window: 120 requests/minute by default. Returns HTTP 429 when exceeded.
5. **Audit Logging** — Every tool call is logged with session ID, tool name, argument keys, and outcome (success/error/auth-denied) under the `mashroom.mcp.audit` log category.
6. **Input Sanitization** — All user input is sanitized before being passed to portal services: HTML tags removed, special characters escaped, CSS injection patterns blocked, path traversal prevented, JSON size limited.
7. **CORS** — Configurable allowed origins. Same-origin by default. Preflight (OPTIONS) requests handled with explicit allowed methods/headers.

## Available MCP Tools

All tools require at least the **Authenticated** role (logged-in user). Write and admin tools additionally require the **Administrator** role.

### Read Tools (Authenticated)

| Tool | Description |
|------|-------------|
| `portal_apps` | List all registered portal SPA apps |
| `portal_themes` | List all portal themes |
| `portal_layouts` | List all portal layouts |
| `page_enhancements` | List page enhancement plugins |
| `app_enhancements` | List app enhancement plugins |
| `portal_sites` | List all sites |
| `get_site` | Get site details by ID |
| `site_pages` | List pages in a site |
| `get_page` | Get page details by ID |
| `get_app_instance` | Get portal app instance config |
| `list_plugins` | List all Mashroom server plugins |
| `get_plugin` | Get plugin details by name |
| `list_plugin_packages` | List npm plugin packages |
| `get_plugin_package` | Get package details by name |
| `list_plugin_loaders` | List registered plugin loaders |
| `plugins_by_type` | Filter plugins by type |
| `list_metrics` | List all collected metrics (counters, gauges, histograms) |
| `get_metric` | Get full data points for a specific metric by name |
| `get_metric_summary` | Compact one-line-per-metric overview of latest values |
| `search_metrics` | Search metrics by substring pattern on name |
| `get_metric_histogram_buckets` | Detailed histogram bucket breakdown for a metric |

### Write Tools (Administrator)

| Tool | Description |
|------|-------------|
| `update_site` | Update site properties (title, path, theme, layout) |
| `update_page` | Update page properties (title, description, CSS, etc.) |
| `update_app_instance` | Update portal app instance configuration |

### Admin Tools (Administrator)

| Tool | Description |
|------|-------------|
| `insert_site` | Create a new site |
| `insert_page` | Create a new page in a site |

## Logging

Log categories for security auditing:

- `mashroom.mcp.audit` — Tool call audit trail (calls, successes, errors)
- `mashroom.mcp.auth` — Authorization denials and access control decisions
- `mashroom.api.mcp` — MCP server lifecycle events
- `mashroom.mcp.tool.loader` — Plugin loading/unloading events

Configure in `log4js.json` or `log4js.js` in the project root.

## MCP Protocol

The `/mcp` endpoint implements the **MCP 2025-03-26 Streamable HTTP Transport**:

| Method | Purpose |
|--------|---------|
| `POST /mcp` | Initialize session or send JSON-RPC requests (tool calls) |
| `GET /mcp` | Subscribe to server-to-client SSE notifications |
| `DELETE /mcp` | Terminate session and release resources |

Requests must include the `Mcp-Session-Id` header after initialization. POST body limit: 10MB.

## Chat Agent

The `/chat` endpoint runs a LangChain agent powered by **Ollama** (default: `granite4.1:3b`). The agent connects to the local MCP server (`http://localhost:5051/mcp`) and can invoke any available tool. It accepts POST requests with a `messages` array:

```json
{
  "messages": [
    { "role": "user", "content": "List all sites" }
  ]
}
```

Response is streamed as plain text via SSE (`Content-Type: text/event-stream`). Requires Ollama running locally.

## Development

```bash
# Build all packages (Rsbuild for most, tsc for mashroom-mcp-chat-api)
pnpm build

# Build a single package
pnpm --filter mashroom-mcp-services build

# Lint and format (all packages use Biome)
pnpm check      # lint + fix
pnpm format     # format only

# Run tests (mashroom-mcp-tools-loader only)
pnpm test

# Type-check all packages
pnpm type-check
```

### Adding a New Tool

1. Add a plugin definition in `packages/mashroom-mcp-tool-plugins/mashroom.json`:

```json
{
  "name": "my_new_tool",
  "type": "mashroom-mcp-tool-plugin",
  "bootstrap": "./dist/my-tool-bundle.js",
  "defaultConfig": {
    "title": "my_new_tool",
    "description": "What it does",
    "category": "my-category",
    "access": {
      "type": "read"
    }
  }
}
```

2. Implement the tool in `packages/mashroom-mcp-tool-plugins/src/` following the existing pattern (see `site-tools/index.ts`). Export a default async function returning an object with `getTool(config, contextHolder)`.

3. Build: `pnpm --filter mashroom-mcp-tool-plugins build`

### Adding Tool Authorization

In the tool's `defaultConfig`, set the `access` field:

```json
"access": {
  "type": "write",
  "roles": ["Administrator"]
}
```

The loader passes this through to `MCPServer`, which wraps every tool callback with an authorization check at invocation time.
