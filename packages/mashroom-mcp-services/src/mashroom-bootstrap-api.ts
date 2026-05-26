import type { MashroomApiPluginBootstrapFunction } from '@mashroom/mashroom/type-definitions';
import type { MashroomMonitoringMetricsCollectorService } from '@mashroom/mashroom-monitoring-metrics-collector/type-definitions';
import MashroomMCPAPI, {
  type MCPToolRegistrationService,
} from './MashroomMCPAPI';

// Use a string key instead of Symbol so it is stable across separate bundle outputs.
// The API bootstrap (dist/index.js) and the services bootstrap
// (dist/mcp-tool-registry.js) are built as independent bundles, each getting its
// own Symbol instance — making cross-bundle Symbol lookup impossible.
const MCP_API_KEY = '__mashroom_mcp_api__';

export function getMCPApi(contextHolder: unknown): MashroomMCPAPI | null {
  return (
    (contextHolder as Record<string, MashroomMCPAPI>)?.[MCP_API_KEY] ?? null
  );
}

export function getRegistrationService(
  contextHolder: unknown,
): MCPToolRegistrationService | null {
  return getMCPApi(contextHolder);
}

/**
 * Set the metrics collector service on the MCP API instance.
 * Called by mashroom-mcp-tool-metrics on first tool load.
 */
export async function setMetricsService(
  contextHolder: unknown,
  service: MashroomMonitoringMetricsCollectorService,
): Promise<void> {
  const api = getMCPApi(contextHolder);
  if (api) {
    await api.setMetricsService(service);
  }
}

const bootstrap: MashroomApiPluginBootstrapFunction = async (
  _,
  pluginConfig,
  pluginContextHolder,
) => {
  const api = new MashroomMCPAPI(
    pluginContextHolder,
    pluginConfig as Record<string, unknown>,
  );
  (pluginContextHolder as unknown as Record<string, MashroomMCPAPI>)[
    MCP_API_KEY
  ] = api;

  return api.router();
};

export default bootstrap;
