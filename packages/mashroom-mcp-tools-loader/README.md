# mashroom-mcp-tools-loader

Custom Mashroom plugin loader for `mashroom-mcp-tool-plugin` type plugins. Discovers, loads, and registers MCP tool plugins into the MCP server's tool registry.

## Purpose

Registers as a Mashroom **plugin-loader** (type: `plugin-loader`) that handles the custom plugin type `mashroom-mcp-tool-plugin`. When Mashroom scans plugin folders and finds a plugin with this type, it delegates to this loader.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Bootstrap function. Creates `MCPToolLoader` instance and connects it to the `"Mashroom MCP Tool Registry"` service |
| `src/pluginLoader.ts` | Core loader class implementing `MashroomPluginLoader`. Handles load/unload lifecycle, config injection, tool registration |

## How It Works

1. Mashroom calls `loader.load(plugin, config, contextHolder)` for each `mashroom-mcp-tool-plugin` plugin
2. The loader resolves the plugin's bootstrap function via `plugin.requireBootstrap()`
3. The bootstrap returns an `MCPToolPluginExport` with a `getTool(config, contextHolder)` method
4. The loader derives the tool name from the plugin name (lowercase, spaces → underscores) and injects it into the config
5. Calls `getTool()` to get the tool descriptor (callback, schemas, annotations)
6. Registers the tool with the MCP registration service, passing through the `access` configuration for authorization

## Tool Loading Flow

```
Mashroom (plugin scan)
  → finds plugin type "mashroom-mcp-tool-plugin"
  → delegates to mashroom-mcp-tools-loader
    → load(plugin, config, contextHolder)
      → plugin.requireBootstrap() → MCPToolPluginExport
      → derive toolName from plugin name
      → inject toolName into config
      → getTool(config, contextHolder) → { callback, inputSchema, ... }
      → registrationService.registerTool(name, toolName, config + access, callback)
```

## Tool Configuration Types

Each tool plugin's `defaultConfig` in `mashroom.json` can define:

| Property | Type | Description |
|----------|------|-------------|
| `title` | `string` | Human-readable tool name (defaults to plugin name) |
| `description` | `string` | Tool description shown to MCP clients |
| `category` | `string` | Category label for grouping (e.g., `"portal-service"`) |
| `access.type` | `"read"` / `"write"` / `"admin"` | Authorization level required |
| `access.roles` | `string[]` | Specific roles required to invoke the tool |

## Unload & Hot Reload

- On unload: calls optional `cleanup()` on the plugin, then unregisters all tools from the registration service
- Hot reload: if a plugin is already loaded, `unload()` is called before reloading (config update scenario)

## Build

```bash
npm run build    # Rsbuild → dist/index.js
npm run check    # Biome lint + fix
npm run format   # Biome format
npm run test     # rstest unit tests
```

## Example mashroom.json

A `mashroom.json` declaring MCP tool plugins. Each plugin must use type `mashroom-mcp-tool-plugin` and provide a `bootstrap` pointing to the compiled entry point.

```json
{
  "$schema": "https://www.mashroom-server.com/schemas/mashroom-plugins.json",
  "devModeBuildScript": "build",
  "plugins": [
    {
      "name": "list_sites",
      "type": "mashroom-mcp-tool-plugin",
      "bootstrap": "./dist/site-tools.js",
      "requires": ["Mashroom Portal WebApp"],
      "defaultConfig": {
        "title": "list_sites",
        "description": "List all registered sites in the portal.",
        "category": "portal-service",
        "access": {
          "type": "read"
        }
      }
    }
  ]
}
```

### Key points

- **`type`** must be `"mashroom-mcp-tool-plugin"` so this loader picks it up
- **`bootstrap`** points to the compiled JS that exports an `MCPToolPluginExport` with a `getTool()` method
- **`requires`** lists Mashroom services the tool depends on (e.g. `"Mashroom Portal WebApp"`)
- **`access.type`** controls authorization: `"read"`, `"write"`, or `"admin"`
- **`access.roles`** restricts the tool to specific roles (optional)
- Multiple tools can share the same `bootstrap` — the derived `toolName` (from plugin `name`) is injected into config for routing
