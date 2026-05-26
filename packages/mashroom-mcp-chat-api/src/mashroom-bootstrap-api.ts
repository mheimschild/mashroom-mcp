import type { MashroomApiPluginBootstrapFunction } from '@mashroom/mashroom/type-definitions';
import MashroomChatApi from './MashroomChatApi';

const bootstrap: MashroomApiPluginBootstrapFunction = async (
  _,
  _pluginConfig,
  pluginContextHolder,
) => {
  const api = new MashroomChatApi(pluginContextHolder);
  return api.router();
};

export default bootstrap;
