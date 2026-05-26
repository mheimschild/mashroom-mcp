declare module '@mashroom/mashroom' {
  export function mashroomServerContextFactory(serverRootPath: string): any; // TODO: server context
  /*
  {
    serverInfo,
    serverConfigHolder,
    loggerFactory,
    scanner,
    builder,
    pluginRegistry,
    serviceRegistry,
    pluginContextHolder,
    server,
    expressApp,
    middlewarePluginDelegate
  }
  */
}

declare namespace Express {
  export interface Request {
    sessionId?: string;
  }
}
