---
name: mashroom-mcp-tool-metrics
description: >
  OpenTelemetry metrics tools for the Mashroom MCP server. Use `mashroom-mcp-skill <tool_name> -d key=value` to call tools.
---

# mashroom-mcp-tool-metrics

OpenTelemetry metrics tools available via the Mashroom MCP server.

## Metrics Tools

| Tool Name | Parameters |
|---|---|
| `list_metrics` | *(none)* — List all collected metrics |
| `get_metric` | `metricName` (required) — Full details of a metric |
| `get_metric_summary` | *(none)* — Summary of all metrics with latest values |
| `search_metrics` | `pattern` (required) — Search metrics by name substring |
| `get_metric_histogram_buckets` | `metricName` (required) — Histogram bucket details (must be histogram metric) |

## Examples

```bash
mashroom-mcp-skill list_metrics
mashroom-mcp-skill get_metric -d metricName=http.server.active_requests
mashroom-mcp-skill get_metric_summary
mashroom-mcp-skill search_metrics -d pattern=http
mashroom-mcp-skill get_metric_histogram_buckets -d metricName=http.server.request.duration
```
