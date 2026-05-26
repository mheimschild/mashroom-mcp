# mashroom-mcp-portal-chat-app

> **Example / reference implementation** — shows how to render MCP tools inside a Mashroom Portal page as a chat widget.

This plugin demonstrates how to build a React-based chat UI portal app that communicates with the `mashroom-mcp-chat-api` backend. It is **not** a production-ready chat app — it's a working reference you can adapt for your own use case.

## Purpose

Registers as a Mashroom **portal-app** plugin (type: `portal-app`). The app is placed on a portal page through the admin UI and provides a chat interface that communicates with the `mashroom-mcp-chat-api` backend.

## Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Chat component: message list, streaming response reader, text input with send button |
| `src/index.tsx` | Portal bootstrap. Mounts React app into the portal-provided DOM element |
| `src/styles.ts` | Inline CSS for chat UI (injected as `<style>` tag) |
| `src/App.css` | Base layout styles |

## How It Works

1. Portal loads the app's JS bundle and calls the global bootstrap function with `(portalEl, setup, services)`
2. React mounts the `App` component into `portalEl`
3. User types a message → sends via `POST /chat` with conversation history (last 20 messages)
4. Response is read as a streaming text body and appended to the assistant message in real-time

## Features

- **Streaming responses** — Reads SSE-like stream from `/chat` token by token
- **Conversation history** — Maintains last 20 non-streaming messages for context
- **Auto-scroll** — Scrolls to bottom on new messages
- **Keyboard support** — Enter to send, Shift+Enter for newline

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `resourcesRoot` | `./dist` | Root path for built static assets |
| `rolePermissions.edit` | `["Administrator"]` | Roles that can edit the app on a page |
| `rolePermissions.doEverything` | `["Administrator"]` | Roles with full app control |

## Portal App Registration (`mashroom.json`)

```json
{
  "name": "MCP Client App",
  "type": "portal-app",
  "bootstrap": "startMCPClientApp",
  "resources": {
    "js": ["static/js/index.js"]
  }
}
```

The `bootstrap` value is the name of the global function exported by the built bundle. The portal loads the JS resources, then calls this function.

## Build

```bash
npm run dev      # Rsbuild dev server (standalone preview)
npm run build    # Rsbuild → dist/ (for Mashroom deployment)
npm run check    # Biome lint + fix
npm run format   # Biome format
```

After building, the `dist/` folder is served as static resources by the portal. The path must match `resourcesRoot` in the plugin config.
