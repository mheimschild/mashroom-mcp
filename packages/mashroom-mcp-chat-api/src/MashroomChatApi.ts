import type {
  MashroomLogger,
  MashroomPluginConfig,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import { Router } from 'express';
import initRouter, { type ChatPluginConfig, setConfig } from './MCPRouter';

const router = Router();

export default class MashroomChatApi {
  private logger: MashroomLogger;

  constructor(
    pluginContextHolder: MashroomPluginContextHolder,
    pluginConfig?: MashroomPluginConfig,
  ) {
    const pluginContext = pluginContextHolder.getPluginContext();
    this.logger = pluginContext.loggerFactory('mashroom.api.chat');

    if (pluginConfig) {
      setConfig(pluginConfig as ChatPluginConfig);
    }

    initRouter(router, this.logger);
  }

  router(): Router {
    return router;
  }
}
