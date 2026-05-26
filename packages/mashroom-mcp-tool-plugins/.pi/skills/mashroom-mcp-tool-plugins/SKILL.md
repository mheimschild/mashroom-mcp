---
name: mashroom-mcp-tool-plugins
description: >
  Portal and plugin management tools for the Mashroom MCP server. Use `mashroom-mcp-skill <tool_name> -d key=value` to call tools.
---

# mashroom-mcp-tool-plugins

Portal and plugin management tools available via the Mashroom MCP server.

## Site Management

| Tool Name | Parameters |
|---|---|
| `portal_sites` | *(none)* — List all registered portal sites |
| `get_site` | `siteId` (required) — Full details of a site by ID |
| `update_site` | `siteId` (required), `title`, `path`, `defaultTheme`, `defaultLayout` |
| `insert_site` | `newSiteId`, `newTitle`, `newPath` (all required), `defaultTheme`, `defaultLayout` |

## Page Management

| Tool Name | Parameters |
|---|---|
| `site_pages` | `sitePath` (required) — path or part of the path |
| `get_page` | `pageId` (required) — Full details of a page by ID |
| `update_page` | `pageId` (required), `title`, `description`, `keywords`, `theme`, `layout`, `extraCss` |
| `insert_page` | `sitePath`, `newPageId`, `newTitle` (all required), `friendlyUrl`, `newDescription`, `theme`, `layout` |

## App Instance Management

| Tool Name | Parameters |
|---|---|
| `get_app_instance` | `pluginName` (required), `instanceId` (optional, omit for singleton) |
| `update_app_instance` | `pluginName` (required), `appConfigJson` (required — JSON string), `instanceId` (optional) |

## Listing Tools (Portal)

| Tool Name | Parameters |
|---|---|
| `portal_apps` | *(none)* — List all portal UI widget apps |
| `portal_themes` | *(none)* — List all portal themes |
| `portal_layouts` | *(none)* — List all portal layouts |
| `page_enhancements` | *(none)* — List page enhancement plugins (JS/CSS injectors) |
| `app_enhancements` | *(none)* — List app enhancement plugins |

## Plugin Tools (MashroomPluginService)

| Tool Name | Parameters |
|---|---|
| `list_plugins` | *(none)* — List all Mashroom server plugins |
| `get_plugin` | `pluginName` (required) — Full details of a plugin by name |
| `list_plugin_packages` | *(none)* — List all npm plugin packages |
| `get_plugin_package` | `packageName` (required) — npm package name |
| `list_plugin_loaders` | *(none)* — List all registered plugin loaders |
| `plugins_by_type` | `pluginType` (required) — `web-app`, `api`, `middleware`, `services`, `storage`, `plugin-loader`, `admin-ui-integration` |

## Examples

```bash
mashroom-mcp-skill portal_sites
mashroom-mcp-skill get_site -d siteId=main-site
mashroom-mcp-skill update_site -d siteId=main-site -d title="My New Title"
mashroom-mcp-skill insert_site -d newSiteId=new-site -d newTitle="New Site" -d newPath=/new-site
mashroom-mcp-skill site_pages -d sitePath=/web
mashroom-mcp-skill insert_page -d sitePath=/web -d newPageId=about -d newTitle="About Us" -d friendlyUrl=/about
mashroom-mcp-skill get_page -d pageId=about
mashroom-mcp-skill update_page -d pageId=about -d title="About" -d theme=dark
mashroom-mcp-skill list_plugins
mashroom-mcp-skill get_plugin -d pluginName="Mashroom Portal WebApp"
mashroom-mcp-skill plugins_by_type -d pluginType=web-app
mashroom-mcp-skill list_plugin_packages
mashroom-mcp-skill get_plugin_package -d packageName=@mashroom/mashroom-portal
mashroom-mcp-skill portal_apps
mashroom-mcp-skill portal_themes
mashroom-mcp-skill get_app_instance -d pluginName="Mashroom Sandbox App"
mashroom-mcp-skill update_app_instance -d pluginName="Mashroom Sandbox App" -d appConfigJson='{"key":"value"}'
```
