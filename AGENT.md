# Mashroom MCP Service — Project Analysis

## Overview

A **Mashroom Server plugin** that bridges the [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) ecosystem with the [Mashroom Portal](https://mashroom-server.com/). It exposes portal management capabilities (sites, pages, apps, themes, layouts) as MCP tools callable by AI agents, and provides a chat UI that connects an LLM to those tools via an agentic pipeline.

**Author:** Milan Heimschild  
**Stack:** TypeScript, Node.js, Express, React 19, LangChain, Ollama, @modelcontextprotocol/sdk

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Mashroom Server                         │
│                     (port 5051)                             │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ mashroom-mcp-services │   │ mashroom-mcp-chat-api │   │ mashroom-mcp-portal-chat-app │
│  │              │   │              │   │                │  │
│  │ /mcp         │◄──│ /chat        │   │ (React portal) │  │
│  │ MCP HTTP     │   │ SSE stream   │   │ chat UI        │  │
│  │ transport    │   │              │   │                │  │
│  └──────┬───────┘   └──────┬───────┘   └────────────────┘  │
│         │                  │                                │
│         ▼                  ▼                                │
│  Portal Service      LangChain agent                        │
│  (sites/pages/       ← connects back to /mcp                │
│   apps/themes)       via MultiServerMCPClient               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User** types a message in the React chat UI (`mashroom-mcp-portal-chat-app`)
2. **Chat UI** POSTs to `/chat` endpoint
3. **Chat API** uses LangChain's `MultiServerMCPClient` to connect to its own `/mcp` endpoint
4. **MCP Server** (streamable HTTP transport) receives tool calls and delegates to Mashroom Portal Service
5. Results flow back through the agent as SSE tokens to the browser

---

## Modules (Plugin Packages)

### 1. `mashroom-mcp-services/` — MCP Server & Tools

The core plugin. Exposes an Express router at `/mcp` implementing the **MCP Streamable HTTP transport** spec.

| File | Purpose |
|------|---------|
| `src/MashroomMCPAPI.ts` | Plugin entry — instantiates API, gets portal service from Mashroom context |
| `src/mashroom-bootstrap-api.ts` | Mashroom bootstrap function returning the Express router |
| `src/MCPServer.ts` | Creates `@modelcontextprotocol/sdk` `McpServer`, registers tools |
| `src/MCPRouter.ts` | HTTP transport layer — GET (SSE stream), POST (requests/init), DELETE (session teardown) |
| `src/MCPTools.ts` | Tool definitions using Zod schemas; helpers for i18n title resolution and site lookup |
| `src/index.d.ts` | Module augmentation for mashroom + Express Request extension |

**Registered MCP Tools:**

| Tool | Parameters | Description |
|------|-----------|-------------|
| `portal_apps` | none | List all registered portal apps (name, description, version, category, remote flag) |
| `portal_themes` | none | List all registered portal themes (name, description, version) |
| `portal_layouts` | none | List all registered portal layouts (name, layoutId, description) |
| `portal_sites` | none | List all registered sites (path, title, page count, defaultTheme, defaultLayout) |
| `get_site` | `siteId: string` | Full site details — pages tree, theme, layout, virtualHosts |
| `update_site` | `siteId`, optional `title`/`path`/`defaultTheme`/`defaultLayout` | Update an existing site (reads existing first, preserves i18n structure) |
| `insert_site` | `newSiteId`, `newTitle`, `newPath`, optional `defaultTheme`/`defaultLayout` | Create a new site |
| `page_enhancements` | none | List global JS/CSS page enhancement plugins |
| `app_enhancements` | none | List app enhancement plugins (custom client services) |
| `site_pages` | `sitePath: string` | List pages for a given site (partial path match) |
| `get_page` | `pageId: string` | Full page details — theme override, layout, extraCss, keywords, assigned apps per area |
| `update_page` | `pageId`, optional `title`/`description`/`keywords`/`theme`/`layout`/`extraCss` | Update page properties (replaces old broken `rename_page`) |
| `insert_page` | `newPageId`, optional `newDescription`/`theme`/`layout` | Create a new page |
| `get_app_instance` | `pluginName`, optional `instanceId` | Read a portal app instance's configuration (appConfig as JSON) |
| `update_app_instance` | `pluginName`, optional `instanceId`, `appConfigJson: string` | Update an app instance's config via JSON string |

**Build:** rsbuild (target: node) → `dist/index.js`

### 2. `mashroom-mcp-chat-api/` — LangChain Agent Chat Endpoint

An API plugin at `/chat` that runs an LLM agent with MCP tool access.

| File | Purpose |
|------|---------|
| `MashroomChatApi.ts` | Plugin entry class, creates router |
| `mashroom-bootstrap-api.ts` | Bootstrap function (note: imports from `MashroomChatApi` but references `MashroomMCPAPI` as default) |
| `MCPRouter.ts` | POST `/chat` handler — streams LLM responses via SSE |

**Agent pipeline:**
- Model: Ollama (`granite4:latest`) via `@langchain/ollama`
- Tools: fetched from MCP server at `http://localhost:5051/mcp` via `MultiServerMCPClient`
- Streaming: uses LangChain's `agent.stream()` with `streamMode: "messages"`, filters out tool-node metadata

**Build:** plain `tsc` (no bundler)

### 3. `mashroom-mcp-portal-chat-app/` — React Chat UI

A Mashroom portal app providing a chat interface. Renders inside the Mashroom portal container.

| File | Purpose |
|------|---------|
| `src/App.tsx` | Chat component — message list, streaming SSE reader, input + send button |
| `src/index.tsx` | Portal bootstrap — mounts React root into `portalEl` |
| `src/styles.ts` | Inline CSS string for chat UI |
| `src/App.css` | Base body/layout styles (unused in current App) |

**Build:** rsbuild + plugin-react → `dist/static/js/index.js`

### 4. `mashroom-mcp-tools-loader/` — Plugin Loader

A Mashroom `plugin-loader` type plugin that loads `mashroom-mcp-tool-plugin` type plugins. Fully implemented — handles tool registration, config injection (including `toolName` derivation), authorization passthrough, and hot-reload (unload before reload).

| File | Purpose |
|------|---------|
| `src/index.ts` | Bootstrap returning `MCPToolLoader` instance |
| `src/pluginLoader.ts` | `MashroomPluginLoader` implementation (stub) |
| `tests/dom.test.ts` | Basic rstest + happy-dom test using @testing-library/dom |

**Build:** rsbuild (target: node)  
**Test:** rstest with happy-dom environment

---

## Configuration Files

### Root Level
- **`mashroom.json`** — Server config: port 5051, plugin package folders for all 4 modules + Mashroom built-in plugins, security provider config
- **`package.json`** — Root dependencies (Mashroom packages, MCP SDK, Zod)
- **`tsconfig.json`** — Root TS config (declaration emit to `dist/`)
- **`biome.json`** — Biome linter/formatter config (single quotes, organize imports, recommended rules)
- **`users.json`** — Simple security provider user definitions (admin, john)

### Per-Module
Each module has its own `package.json`, `mashroom.json`, and build config. Shared patterns:
- All use Biome for linting/formatting
- All use rsbuild except `mashroom-mcp-chat-api` (uses plain tsc)
- `devModeBuildScript: "build"` in mashroom plugin manifests

---

## Running the Project

```bash
npm install          # root dependencies
npm run dev          # starts Mashroom server via tsx testserver/starter.ts
```

Server runs at **http://localhost:5051** with endpoints:
- `/mcp` — MCP streamable HTTP transport
- `/chat` — Chat API (SSE streaming)
- `/portal/*` — Mashroom Portal UI (requires auth, role: Authenticated)
- `/login` — Login page

---

## Key Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@mashroom/mashroom` | ^2.9.4 | Core server framework |
| `@modelcontextprotocol/sdk` | ^1.26.0 | MCP protocol implementation |
| `langchain` | ^1.2.27 | Agent orchestration (mashroom-mcp-chat-api) |
| `@langchain/mcp-adapters` | ^1.1.3 | MCP client adapter for LangChain |
| `@langchain/ollama` | ^1.2.4 | Ollama model provider |
| `zod` | ^4.3.6 | Schema validation for tool inputs |
| `react` / `react-dom` | ^19.2.x | Chat UI framework |
| `@rsbuild/core` | ^1.7.1 | Bundler (mashroom-mcp-services, mashroom-mcp-portal-chat-app, mashroom-mcp-tools-loader) |
| `@biomejs/biome` | ^2.4.2 | Linter/formatter |

---

## Known Issues / Code Smells

1. **`mashroom-mcp-chat-api/mashroom-bootstrap-api.ts`** — imports `MashroomChatApi` as `MashroomMCPAPI` (misleading alias)
2. **Hardcoded localhost URL** in `mashroom-mcp-chat-api/MCPRouter.ts` (`http://localhost:5051/mcp`) — won't work in non-local deployments
3. **No `.gitignore`** — `dist/`, `node_modules/`, and `.DS_Store` files are tracked
4. **`console.log` still present** in `MashroomMCPAPI.ts` (removed from `MCPTools.ts`)
5. **`App.css` styles** appear unused — the App component uses inline `styles.ts` string instead
6. **No error handling** for Ollama unavailability in mashroom-mcp-chat-api
7. **`deleteSite`/`deletePage`/`deletePortalAppInstance` not exposed** — these require a `Request` object which is unavailable in the MCP tool context; would need an adapter or alternative approach

---

## Directory Structure Summary

```
mashroom-mcp-service/
├── mashroom-mcp-services/           # MCP server + portal tools (core plugin)
│   └── src/
│       ├── MashroomMCPAPI.ts
│       ├── mashroom-bootstrap-api.ts
│       ├── MCPServer.ts
│       ├── MCPRouter.ts
│       └── mcp-tool-registry.ts
├── mashroom-mcp-tools-loader/       # Plugin loader for mashroom-mcp-tool-plugin type
│   └── src/
│       ├── index.ts
│       └── pluginLoader.ts
├── mashroom-mcp-tool-plugins/       # 21 MCP tool implementations (portal, plugins)
│   └── src/
│       ├── listing-tools/index.ts
│       ├── site-tools/index.ts
│       ├── page-tools/index.ts
│       ├── app-instance-tools/index.ts
│       ├── plugin-tools/index.ts
│       ├── helpers.ts
│       └── types.ts
├── mashroom-mcp-tool-metrics/       # 5 MCP metric tools (monitoring collector)
│   └── src/
│       ├── metrics-tools/index.ts
│       └── types.ts
├── mashroom-mcp-chat-api/           # LangChain agent + SSE chat endpoint
│   ├── MashroomChatApi.ts
│   ├── mashroom-bootstrap-api.ts
│   └── MCPRouter.ts
├── mashroom-mcp-portal-chat-app/    # React chat UI (portal app)
│   └── src/
│       ├── App.tsx
│       ├── index.tsx
│       └── styles.ts
├── mashroom-mcp-skill/              # Rust CLI client for MCP tools
│   ├── Cargo.toml
│   └── src/
├── testserver/                      # Dev server bootstrap + test data
│   ├── starter.ts                   # imports @mashroom/mashroom/dist/server
│   ├── acl.json
│   └── data/storage/                # Filestore persistence files
├── mashroom.json                    # Server configuration
├── package.json                     # Root dependencies
├── tsconfig.json                    # Root TypeScript config
├── biome.json                       # Biome config
└── users.json                       # User definitions
```
