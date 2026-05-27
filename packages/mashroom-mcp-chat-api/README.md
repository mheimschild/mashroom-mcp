# mashroom-mcp-chat-api

> **API plugin** — provides a LangChain-based chat endpoint that connects an LLM to MCP tools via the `mashroom-mcp-services` plugin.

This plugin exposes a `POST /chat` endpoint that accepts user messages and streams LLM responses via SSE. The LLM is given access to MCP tools (e.g., portal management) through a `MultiServerMCPClient` connection.

## Purpose

Registers as a Mashroom **api** plugin (type: `api`). It creates an Express router mounted at `/chat` that:

1. Accepts a user message via `POST /chat`
2. Initializes a LangChain agent with tools from the MCP server
3. Streams the agent's response back to the client via SSE

## Files

| File | Purpose |
|------|---------|
| `src/MashroomChatApi.ts` | Plugin entry class — creates router, applies config |
| `src/mashroom-bootstrap-api.ts` | Mashroom bootstrap function |
| `src/MCPRouter.ts` | POST `/chat` handler — streams LLM responses via SSE |

## How It Works

1. User sends `POST /chat` with `{ "message": "..." }`
2. On first request, the agent is lazily initialized:
   - Ollama model is instantiated with configured model name and base URL
   - `MultiServerMCPClient` connects to the configured MCP server URL
   - Tools are loaded from the MCP server
   - `createReactAgent` builds the agent with the model and tools
3. The agent processes the message and streams responses via SSE
4. Client receives `data: { "content": "..." }` events followed by `data: [DONE]`

## Configuration

All settings are configurable via `mashroom.json` using the plugin's `defaultConfig`. Override values by setting the plugin config in your server's `mashroom.json` under the `"plugins"` section.

| Property | Default | Description |
|----------|---------|-------------|
| `model` | `"granite4:latest"` | Ollama model name to use for the agent |
| `ollamaBaseUrl` | `"http://localhost:11434"` | Base URL of the Ollama server |
| `mcpUrl` | `"http://localhost:5051/mcp"` | URL of the MCP server (streamable HTTP transport) providing tools |

### Example: Override in Server Config

In your server's `mashroom.json` (e.g., `testserver/mashroom.json`), add the plugin config under `"plugins"`:

```json
{
  "plugins": {
    "Mashroom MCP Chat API": {
      "model": "llama3.1:latest",
      "ollamaBaseUrl": "http://192.168.1.100:11434",
      "mcpUrl": "http://192.168.1.100:5051/mcp"
    }
  }
}
```

### Example: Remote Ollama + Custom MCP Endpoint

```json
{
  "plugins": {
    "Mashroom MCP Chat API": {
      "model": "deepseek-r1:latest",
      "ollamaBaseUrl": "https://ollama.example.com",
      "mcpUrl": "https://mcp.example.com/v1/mcp"
    }
  }
}
```

## Plugin Registration (`mashroom.json`)

```json
{
  "name": "Mashroom MCP Chat API",
  "type": "api",
  "bootstrap": "./dist/index.js",
  "requires": ["Mashroom MCP API"],
  "defaultConfig": {
    "model": "granite4:latest",
    "ollamaBaseUrl": "http://localhost:11434",
    "mcpUrl": "http://localhost:5051/mcp"
  }
}
```

The plugin requires `Mashroom MCP API` (from `mashroom-mcp-services`) because it connects to the MCP server to load available tools.

## API

### POST `/chat`

**Request:**

```json
{
  "message": "List all portal sites"
}
```

**Response:** SSE stream

```
data: {"content":"Let me check the available sites..."}

data: {"content":"Here are the sites..."}

data: [DONE]
```

**Error responses:**

- `400` — Missing `"message"` in request body
- `500` — Internal server error (Ollama unavailable, MCP connection failed, etc.)

## Build

```bash
npm run build       # tsc → dist/
npm run check       # Biome lint
npm run check:fix   # Biome lint + fix
npm run type-check  # tsc --noEmit
```

After building, the `dist/` folder contains the compiled JS that the Mashroom server loads.
