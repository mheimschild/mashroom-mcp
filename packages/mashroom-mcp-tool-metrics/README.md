# mashroom-mcp-tool-metrics

MCP tools that expose metrics collected by the Mashroom Monitoring Metrics Collector. Provides visibility into system health, request performance, and custom application metrics via the MCP protocol.

## Purpose

Each tool is a `mashroom-mcp-tool-plugin` plugin loaded by `mashroom-mcp-tools-loader`. Connects to the `MashroomMonitoringMetricsCollectorService` (from `@mashroom/mashroom-monitoring-metrics-collector`) and serializes OpenTelemetry metric data into readable MCP text responses.

## Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_metrics` | none | List all collected metrics with name, type (counter/gauge/histogram), description, unit, and data point count |
| `get_metric` | `metricName: string` | Full details for a specific metric — all data points with values, attributes (labels), and timestamps |
| `get_metric_summary` | none | Compact one-line-per-metric overview showing the latest value for every metric |
| `search_metrics` | `pattern: string` | Search metrics by substring match on name. Returns matching names, types, and descriptions |
| `get_metric_histogram_buckets` | `metricName: string` | Detailed histogram bucket breakdown — boundaries, counts, sum, min, max for a histogram-type metric |

## Metric Types

The underlying OpenTelemetry SDK supports four data point types:

| Type | Description | Example |
|------|-------------|---------|
| `sum` (counter) | Cumulative monotonically increasing values | Request counts, error counts |
| `gauge` | Point-in-time values that can go up or down | Active connections, memory usage |
| `histogram` | Distribution of observed values with configurable buckets | Request duration, response size |
| `exponential-histogram` | Auto-scaling histogram using exponential bucket boundaries | High-cardinality distributions |

## Metrics Source

Metrics come from three sources registered by the collector:

1. **Node.js runtime metrics** — CPU, memory, GC, event loop lag (via `opentelemetry-node-metrics`)
2. **Plugin lifecycle metrics** — Plugin load times, error counts
3. **HTTP request metrics** — Request duration histograms, status code counters (via middleware)

Plus any custom metrics registered by other Mashroom plugins using the collector service API.

## Files

| File | Purpose |
|------|---------|
| `src/metrics-tools/index.ts` | All 5 tool implementations + OpenTelemetry serialization helpers |
| `src/types.ts` | Shared MCP tool types (`MCPToolDescriptor`, `MCPToolPluginExport`) |

## Metric Serialization

The tools call `collectorService.getOpenTelemetryResourceMetrics()` which triggers the internal `MetricReader.collect()`. The returned `ResourceMetrics` tree is walked to extract:

- **Metric descriptor** — name, description, unit, type
- **Data points** — value, attributes (labels), start/end timestamps
- **Histogram buckets** — explicit boundaries and per-bucket counts

All output is formatted as plain text for MCP compatibility. Histogram values show `{ count=N, sum=S, min=M, max=X, buckets=[...] }`.

## Access Levels

All metrics tools are **read-only** (`access.type: "read"`) — any authenticated user can call them.

## Build

```bash
npm run build    # Rsbuild → dist/metrics-tools.js
npm run check    # Biome lint + fix
npm run format   # Biome format
```
