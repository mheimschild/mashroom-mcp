# mashroom-mcp-tool-plugins

21 MCP tool implementations that expose Mashroom Portal management capabilities to LLM agents via the Model Context Protocol.

## Purpose

Each tool is a `mashroom-mcp-tool-plugin` plugin loaded by `mashroom-mcp-tools-loader`. Tools are grouped into bundles that share a bootstrap file, with routing based on the `toolName` injected by the loader.

## Tool Bundles

| Bundle | File | Tools |
|--------|------|-------|
| **listing-tools** | `src/listing-tools/index.ts` | `portal_apps`, `portal_themes`, `portal_layouts`, `page_enhancements`, `app_enhancements` |
| **site-tools** | `src/site-tools/index.ts` | `portal_sites`, `get_site`, `update_site`, `insert_site` |
| **page-tools** | `src/page-tools/index.ts` | `site_pages`, `get_page`, `update_page`, `insert_page` |
| **app-instance-tools** | `src/app-instance-tools/index.ts` | `get_app_instance`, `update_app_instance` |
| **plugin-tools** | `src/plugin-tools/index.ts` | `list_plugins`, `get_plugin`, `list_plugin_packages`, `get_plugin_package`, `list_plugin_loaders`, `plugins_by_type` |

## Shared Utilities (`src/helpers.ts`)

| Function | Purpose |
|----------|---------|
| `resolveTitle()` | Resolves i18n string objects to a single display value |
| `findSiteByPath()` | Finds a portal site by partial path match |
| `sanitizeInput(str, maxLength)` | Strips HTML tags, escapes injection characters, removes null bytes, truncates to max length |
| `sanitizeCss(input, maxLength)` | Sanitizes CSS input: blocks `expression()`, `javascript:`, `@import`, `behavior:`, `-moz-binding:` |
| `sanitizePath(input)` | Sanitizes URL paths: prevents `..` traversal, strips control chars, ensures leading `/` |
| `sanitizeJson(input, maxSize)` | Validates JSON structure (must be object), enforces size limit |

All mutation tools (`update_*`, `insert_*`) sanitize every user-supplied parameter before passing it to the portal service. All ID lookups are sanitized to prevent injection attacks.

## Tool Access Levels

| Level | Tools | Required Role |
|-------|-------|---------------|
| **read** | All listing and get tools | Any authenticated user |
| **write** | `update_site`, `update_page`, `update_app_instance` | `Administrator` |
| **admin** | `insert_site`, `insert_page` | `Administrator` |

Access is defined per-tool in `mashroom.json` under each plugin's `defaultConfig.access`.

## Adding a New Tool

1. Add the plugin definition to `mashroom.json`:

```json
{
  "name": "my_tool",
  "type": "mashroom-mcp-tool-plugin",
  "bootstrap": "./dist/my-bundle.js",
  "defaultConfig": {
    "title": "my_tool",
    "description": "Does something useful",
    "category": "my-category",
    "access": { "type": "read" }
  }
}
```

2. Create the implementation in `src/`. For multi-tool bundles, add to the `toolMap`:

```typescript
toolMap.set('my_tool', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal?.service;
  return {
    inputSchema: { argName: z.string().describe('Description') },
    callback: async ({ argName }) => {
      // sanitize inputs, call services, return result
      return { content: [{ type: 'text', text: 'result' }] };
    },
  };
});
```

3. Build: `npm run build`

## Tool Callback Contract

Each tool callback returns:

```typescript
{
  content: Array<{ type: 'text'; text: string }>;
}
```

On error, return the same shape with a descriptive error message in `text`. Never throw — let the framework handle uncaught errors.

## Build

```bash
npm run build       # Rsbuild → dist/*.js (one file per tool bundle)
npm run check       # Biome lint + fix
npm run type-check  # TypeScript type checking
npm run format      # Biome format
```
