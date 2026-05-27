import type { MashroomApiPluginBootstrapFunction } from '@mashroom/mashroom/type-definitions';
import MashroomChatApi from './MashroomChatApi';

const bootstrap: MashroomApiPluginBootstrapFunction = async (
  _,
  pluginConfig,
  pluginContextHolder,
) => {
  const api = new MashroomChatApi(pluginContextHolder, pluginConfig);
  return api.router();
};

export default bootstrap;
