import type {
  MashroomLogger,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import type {
  DataPoint,
  MetricData,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import type { Histogram } from '@opentelemetry/sdk-metrics/build/esm/aggregator/types';
import z from 'zod';
import type {
  MCPToolConfig,
  MCPToolDescriptor,
  MCPToolPluginExport,
} from '../types';

function createLogger(
  contextHolder: MashroomPluginContextHolder,
): MashroomLogger {
  return contextHolder
    .getPluginContext()
    .loggerFactory('mashroom.mcp-tools.metrics');
}

// ---------------------------------------------------------------------------
// Wire the metrics collector into the MCP API (once, on first tool load)
// ---------------------------------------------------------------------------

let _metricsWired = false;

async function wireMetricsService(
  contextHolder: MashroomPluginContextHolder,
): Promise<void> {
  if (_metricsWired) return;
  _metricsWired = true;

  const log = createLogger(contextHolder);
  try {
    const services = contextHolder.getPluginContext().services;
    const metricsService = (services as Record<string, any>).metrics?.service;
    const mcpApi = (services as Record<string, any>).mcp?.mcpApi;

    if (metricsService && mcpApi?.setMetricsService) {
      await mcpApi.setMetricsService(metricsService);
      log.info('Metrics collector wired into MCP API');
    } else {
      log.warn(
        'Metrics collector service or MCP API not found — ' +
          'tool registration metrics will not be recorded.',
      );
    }
  } catch (err) {
    log.warn(
      `Could not wire metrics collector: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers — serialize OpenTelemetry metric data into readable text
// ---------------------------------------------------------------------------

type MetricEntry = {
  name: string;
  description: string;
  unit: string;
  dataPointType: string;
  dataPointsCount: number;
  latestValue?: string;
};

function getDataPointTypeName(type: number): string {
  switch (type) {
    case 0:
      return 'histogram';
    case 1:
      return 'exponential-histogram';
    case 2:
      return 'gauge';
    case 3:
      return 'sum';
    default:
      return `unknown(${type})`;
  }
}

function getLatestValue(metricData: MetricData): string {
  const points = metricData.dataPoints;
  if (!points || points.length === 0) return '(no data)';

  // Find the data point with the latest endTime
  let latestPoint: DataPoint<any> | null = null;
  for (const dp of points) {
    if (!latestPoint || dp.endTime[0] > latestPoint.endTime[0]) {
      latestPoint = dp;
    }
  }

  if (!latestPoint) return '(no data)';

  const value = latestPoint.value;
  switch (metricData.dataPointType) {
    case 0: // histogram
    case 1: // exponential-histogram
      return formatHistogramValue(value as Histogram);
    case 2: // gauge
    case 3: // sum
      return String(value);
    default:
      return String(value);
  }
}

function formatHistogramValue(h: Histogram): string {
  const parts: string[] = [];
  if (h.count !== undefined) parts.push(`count=${h.count}`);
  if (h.sum !== undefined) parts.push(`sum=${h.sum}`);
  if (h.min !== undefined) parts.push(`min=${h.min}`);
  if (h.max !== undefined) parts.push(`max=${h.max}`);

  const buckets = h.buckets?.counts ?? [];
  const boundaries = h.buckets?.boundaries ?? [];
  if (buckets.length > 0 && boundaries.length > 0) {
    const bucketStrs: string[] = [];
    for (let i = 0; i <= boundaries.length; i++) {
      const lower = i === 0 ? '-Inf' : boundaries[i - 1];
      const upper = i < boundaries.length ? boundaries[i] : '+Inf';
      bucketStrs.push(`[${lower},${upper})=${buckets[i] ?? 0}`);
    }
    parts.push(`buckets=[${bucketStrs.join(', ')}]`);
  }

  return parts.length > 0 ? `{ ${parts.join(', ')} }` : '(empty histogram)';
}

function formatAttributes(attributes: Record<string, any>): string {
  const entries = Object.entries(attributes).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

function buildMetricsList(resourceMetrics: ResourceMetrics): MetricEntry[] {
  const entries: MetricEntry[] = [];

  for (const scopeMetrics of resourceMetrics.scopeMetrics) {
    for (const metricData of scopeMetrics.metrics) {
      entries.push({
        name: metricData.descriptor.name,
        description: metricData.descriptor.description || '(none)',
        unit: metricData.descriptor.unit || '',
        dataPointType: getDataPointTypeName(metricData.dataPointType),
        dataPointsCount: metricData.dataPoints.length,
        latestValue: getLatestValue(metricData),
      });
    }
  }

  return entries;
}

function findMetric(
  resourceMetrics: ResourceMetrics,
  name: string,
): MetricData | null {
  for (const scopeMetrics of resourceMetrics.scopeMetrics) {
    for (const metricData of scopeMetrics.metrics) {
      if (metricData.descriptor.name === name) {
        return metricData;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

type MetricsCollectorService = {
  getOpenTelemetryResourceMetrics(): Promise<ResourceMetrics>;
};

function getService(
  contextHolder: MashroomPluginContextHolder,
): MetricsCollectorService {
  const svc = (contextHolder.getPluginContext().services as any).metrics
    ?.service;
  if (!svc) {
    throw new Error(
      'Mashroom Monitoring Metrics Collector service not available',
    );
  }
  return svc as MetricsCollectorService;
}

const toolMap = new Map<
  string,
  (contextHolder: MashroomPluginContextHolder) => MCPToolDescriptor
>();

// list_metrics
toolMap.set('list_metrics', (contextHolder) => {
  const collectorService = getService(contextHolder);
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('list_metrics called');
      const resourceMetrics =
        await collectorService.getOpenTelemetryResourceMetrics();
      const entries = buildMetricsList(resourceMetrics);

      if (entries.length === 0) {
        return {
          content: [{ type: 'text', text: 'No metrics collected yet.' }],
        };
      }

      const lines = entries.map(
        (e, idx) =>
          `${idx + 1}. ${e.name}\n   type: ${e.dataPointType}\n   description: ${e.description}\n   unit: ${e.unit || '(none)'}\n   dataPoints: ${e.dataPointsCount}`,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Metrics (${entries.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// get_metric
toolMap.set('get_metric', (contextHolder) => {
  const collectorService = getService(contextHolder);
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      metricName: z
        .string()
        .describe('The exact metric name as shown in list_metrics'),
    },
    callback: async ({ metricName }: { metricName: string }) => {
      log.debug(`get_metric called, metricName=${metricName}`);
      const resourceMetrics =
        await collectorService.getOpenTelemetryResourceMetrics();
      const metricData = findMetric(resourceMetrics, metricName);

      if (!metricData) {
        return {
          content: [
            { type: 'text', text: `Metric "${metricName}" not found.` },
          ],
        };
      }

      const header = [
        `Metric details:\n====================`,
        `name: ${metricData.descriptor.name}`,
        `type: ${getDataPointTypeName(metricData.dataPointType)}`,
        `description: ${metricData.descriptor.description || '(none)'}`,
        `unit: ${metricData.descriptor.unit || '(none)'}`,
        `isMonotonic: ${'isMonotonic' in metricData ? metricData.isMonotonic : 'n/a'}`,
        `aggregationTemporality: ${metricData.aggregationTemporality === 0 ? 'CUMULATIVE' : 'DELTA'}`,
      ].join('\n');

      const points = metricData.dataPoints;
      if (points.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `${header}\n\nNo data points collected yet.`,
            },
          ],
        };
      }

      const pointLines = points.map((dp, idx) => {
        const attrs = formatAttributes(dp.attributes);
        const timeLabel = attrs ? ` [${attrs}]` : '';
        const valueStr =
          getDataPointTypeName(metricData.dataPointType) === 'histogram'
            ? formatHistogramValue(dp.value as Histogram)
            : String(dp.value);

        return `${idx + 1}. value: ${valueStr}${timeLabel}`;
      });

      return {
        content: [
          {
            type: 'text',
            text: `${header}\n\nData points (${points.length}):\n${pointLines.join('\n')}`,
          },
        ],
      };
    },
  };
});

// get_metric_summary
toolMap.set('get_metric_summary', (contextHolder) => {
  const collectorService = getService(contextHolder);
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('get_metric_summary called');
      const resourceMetrics =
        await collectorService.getOpenTelemetryResourceMetrics();
      const entries = buildMetricsList(resourceMetrics);

      if (entries.length === 0) {
        return {
          content: [{ type: 'text', text: 'No metrics collected yet.' }],
        };
      }

      const lines = entries.map(
        (e) => `${e.name} [${e.dataPointType}]: ${e.latestValue}`,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Metric summary (${entries.length} metrics):\n====================\n\n${lines.join('\n')}`,
          },
        ],
      };
    },
  };
});

// search_metrics
toolMap.set('search_metrics', (contextHolder) => {
  const collectorService = getService(contextHolder);
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      pattern: z.string().describe('Substring to search for in metric names'),
    },
    callback: async ({ pattern }: { pattern: string }) => {
      log.debug(`search_metrics called, pattern=${pattern}`);
      const resourceMetrics =
        await collectorService.getOpenTelemetryResourceMetrics();
      const entries = buildMetricsList(resourceMetrics);
      const lowerPattern = pattern.toLowerCase();

      const filtered = entries.filter((e) =>
        e.name.toLowerCase().includes(lowerPattern),
      );

      if (filtered.length === 0) {
        return {
          content: [
            { type: 'text', text: `No metrics found matching "${pattern}".` },
          ],
        };
      }

      const lines = filtered.map(
        (e, idx) =>
          `${idx + 1}. ${e.name}\n   type: ${e.dataPointType}\n   description: ${e.description}`,
      );

      return {
        content: [
          {
            type: 'text',
            text: `Metrics matching "${pattern}" (${filtered.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// get_metric_histogram_buckets
toolMap.set('get_metric_histogram_buckets', (contextHolder) => {
  const collectorService = getService(contextHolder);
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      metricName: z.string().describe('The exact histogram metric name'),
    },
    callback: async ({ metricName }: { metricName: string }) => {
      log.debug(
        `get_metric_histogram_buckets called, metricName=${metricName}`,
      );
      const resourceMetrics =
        await collectorService.getOpenTelemetryResourceMetrics();
      const metricData = findMetric(resourceMetrics, metricName);

      if (!metricData) {
        return {
          content: [
            { type: 'text', text: `Metric "${metricName}" not found.` },
          ],
        };
      }

      if (metricData.dataPointType !== 0 && metricData.dataPointType !== 1) {
        return {
          content: [
            {
              type: 'text',
              text: `Metric "${metricName}" is of type "${getDataPointTypeName(metricData.dataPointType)}", not a histogram.`,
            },
          ],
        };
      }

      const points = metricData.dataPoints;
      if (points.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Metric "${metricName}" has no data points yet.`,
            },
          ],
        };
      }

      // Use the latest data point
      let latestPoint: DataPoint<any> = points[0];
      for (const dp of points) {
        if (dp.endTime[0] > latestPoint.endTime[0]) {
          latestPoint = dp;
        }
      }

      const h = latestPoint.value as Histogram;
      const attrs = formatAttributes(latestPoint.attributes);
      const attrLabel = attrs ? ` [${attrs}]` : '';

      const boundaries = h.buckets?.boundaries ?? [];
      const bucketCounts = h.buckets?.counts ?? [];
      const bucketLines: string[] = [];

      for (let i = 0; i <= boundaries.length; i++) {
        const lower = i === 0 ? '-Inf' : String(boundaries[i - 1]);
        const upper = i < boundaries.length ? String(boundaries[i]) : '+Inf';
        bucketLines.push(
          `  [${lower}, ${upper}) => ${bucketCounts[i] ?? 0} samples`,
        );
      }

      const summary = [
        `Histogram buckets for "${metricName}"${attrLabel}:\n====================`,
        `count: ${h.count ?? 'n/a'}`,
        `sum: ${h.sum ?? 'n/a'}`,
        `min: ${h.min ?? 'n/a'}`,
        `max: ${h.max ?? 'n/a'}`,
        `\nBuckets:`,
        ...bucketLines,
      ].join('\n');

      return { content: [{ type: 'text', text: summary }] };
    },
  };
});

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

const toolPlugin: MCPToolPluginExport = {
  getTool(config, contextHolder) {
    const svc = (contextHolder.getPluginContext().services as any).metrics
      ?.service;
    if (!svc) {
      throw new Error(
        'Mashroom Monitoring Metrics Collector service not available',
      );
    }

    // Wire the metrics collector into the MCP API (once)
    void wireMetricsService(contextHolder);

    const toolName = (config as MCPToolConfig).toolName;
    const factory = toolMap.get(toolName);
    if (!factory) {
      throw new Error(`Unknown metrics tool: "${toolName}"`);
    }

    return factory(contextHolder);
  },
};

export default async () => toolPlugin;
