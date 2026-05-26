import type { MashroomServicesPluginBootstrapFunction } from '@mashroom/mashroom/type-definitions';
import { getRegistrationService } from './mashroom-bootstrap-api';

const bootstrap: MashroomServicesPluginBootstrapFunction = async (
  _pluginName,
  _pluginConfig,
  contextHolder,
) => {
  const registrationService = getRegistrationService(contextHolder);

  if (!registrationService) {
    throw new Error(
      'Mashroom MCP API not initialized. Ensure "Mashroom MCP API" plugin loaded first.',
    );
  }

  return { mcpApi: registrationService };
};

export default bootstrap;
