import type { MashroomPluginLoaderPluginBootstrapFunction } from '@mashroom/mashroom/type-definitions';
import MCPToolLoader from './pluginLoader';

const bootstrap: MashroomPluginLoaderPluginBootstrapFunction = async (
  _pluginName,
  _pluginConfig,
  contextHolder,
) => {
  const loggerFactory = contextHolder.getPluginContext().loggerFactory;
  const logger = loggerFactory('mashroom.mcp.tool.loader');

  const loader = new MCPToolLoader(loggerFactory);

  // Resolve the MCP tool registration service at bootstrap time.
  // The "mcp" services plugin must be loaded first
  // (enforced by the "requires" in mashroom.json).
  try {
    const services = contextHolder.getPluginContext().services;
    const registryServices = (services as Record<string, any>)['mcp'];
    if (registryServices?.mcpApi) {
      loader.setRegistrationService(registryServices.mcpApi);
      logger.info('Connected to MCP tool registration service');
    } else {
      logger.warn(
        'MCP service not found in services namespace — ' +
          'tools loaded by this plugin loader will not be registered on the MCPServer.',
      );
    }
  } catch (err) {
    logger.warn(
      `Could not access MCP service: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return loader;
};

export default bootstrap;
