import type {
  MashroomLogger,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import { Router } from 'express';
import initRouter from './MCPRouter';

const router = Router();

export default class MashroomChatApi {
  private logger: MashroomLogger;

  constructor(pluginContextHolder: MashroomPluginContextHolder) {
    const pluginContext = pluginContextHolder.getPluginContext();
    this.logger = pluginContext.loggerFactory('mashroom.api.chat');

    initRouter(router, this.logger);
  }

  router(): Router {
    return router;
  }
}
