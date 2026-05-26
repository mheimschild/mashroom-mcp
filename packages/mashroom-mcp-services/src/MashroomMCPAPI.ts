import type {
  MashroomLogger,
  MashroomPluginConfig,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import type {
  MashroomMonitoringMetricsCollectorService,
  MashroomMonitoringMetricsObservableCallbackRef,
} from '@mashroom/mashroom-monitoring-metrics-collector/type-definitions';
import { Router } from 'express';
import initRouter, { setAllowedOrigins, setRateLimitConfig } from './MCPRouter';
import getServer, {
  cleanupExpiredSessions,
  getToolCount,
  initSecurityLoggers,
  registerToolFromPlugin,
  setSessionTTL,
  unregisterToolsFromPlugin,
} from './MCPServer';

const router = Router();

export interface MCPToolRegistrationService {
  registerTool(
    pluginName: string,
    toolName: string,
    config: Record<string, unknown>,
    callback: (...args: any[]) => Promise<any>,
  ): void;
  unregisterPluginTools(pluginName: string): void;
}

export interface MCPServerConfig extends MashroomPluginConfig {
  sessionTTL?: number;
  rateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
  allowedOrigins?: string[];
}

/**
 * Extended registration service that also exposes metrics configuration.
 */
export interface MCPToolRegistrationServiceWithMetrics
  extends MCPToolRegistrationService {
  setMetricsService(
    service: MashroomMonitoringMetricsCollectorService,
  ): Promise<void>;
}

export default class MashroomMCPApi implements MCPToolRegistrationService {
  private logger: MashroomLogger;
  private _metricsService: MashroomMonitoringMetricsCollectorService | null =
    null;
  private _metricsCallbackRef: MashroomMonitoringMetricsObservableCallbackRef | null =
    null;

  constructor(
    pluginContextHolder: MashroomPluginContextHolder,
    config?: MCPServerConfig,
  ) {
    const pluginContext = pluginContextHolder.getPluginContext();
    this.logger = pluginContext.loggerFactory('mashroom.api.mcp');

    // Initialize security loggers
    const auditLogger = pluginContext.loggerFactory('mashroom.mcp.audit');
    const authLogger = pluginContext.loggerFactory('mashroom.mcp.auth');
    initSecurityLoggers(
      (msg) => auditLogger.info(msg),
      (msg) => authLogger.warn(msg),
    );

    // Apply security configuration
    if (config) {
      if (config.sessionTTL && config.sessionTTL > 0) {
        setSessionTTL(config.sessionTTL);
      }
      if (config.rateLimitMaxRequests && config.rateLimitWindowMs) {
        setRateLimitConfig(
          config.rateLimitMaxRequests,
          config.rateLimitWindowMs,
        );
      }
      if (Array.isArray(config.allowedOrigins)) {
        setAllowedOrigins(config.allowedOrigins);
      }
    }

    // Create the MCP server instance eagerly so tools can be registered
    // by mashroom-mcp-tools-loader before any transport session connects.
    getServer();

    // Register observable gauge for current tool count (runs even without metrics service)
    void this._registerToolCountGauge();

    initRouter(router, this.logger);

    // Periodic cleanup of expired sessions (every 5 minutes)
    setInterval(
      () => {
        const cleaned = cleanupExpiredSessions();
        if (cleaned > 0) {
          this.logger.info(`Cleaned up ${cleaned} expired MCP session(s)`);
        }
      },
      5 * 60 * 1000,
    );
  }

  router(): Router {
    return router;
  }

  /**
   * Register an MCP tool from a plugin loaded by mashroom-mcp-tools-loader.
   */
  registerTool(
    pluginName: string,
    toolName: string,
    config: Record<string, unknown>,
    callback: (...args: any[]) => Promise<any>,
  ): void {
    const result = registerToolFromPlugin(
      pluginName,
      toolName,
      config,
      callback,
    );
    if (result) {
      this.logger.info(
        `Registered MCP tool "${toolName}" from plugin "${pluginName}"`,
      );
    } else {
      this.logger.warn(
        `Could not register tool "${toolName}" — MCP server not initialized`,
      );
    }

    // Record registration metric
    if (this._metricsService) {
      this._metricsService
        .counter(
          'mashroom_mcp_tools_registered_total',
          'Total number of MCP tool registrations since startup',
        )
        .inc();
    }
  }

  /**
   * Unregister all tools from a given plugin (called on unload).
   */
  unregisterPluginTools(pluginName: string): void {
    unregisterToolsFromPlugin(pluginName);
    this.logger.info(`Unregistered all MCP tools from plugin "${pluginName}"`);

    // Record unregistration metric
    if (this._metricsService) {
      this._metricsService
        .counter(
          'mashroom_mcp_tools_unregistered_total',
          'Total number of MCP tool unregistrations since startup',
        )
        .inc();
    }
  }

  /**
   * Set the metrics collector service for tracking registration counters.
   * Called by mashroom-mcp-tool-metrics on first tool load.
   */
  async setMetricsService(
    service: MashroomMonitoringMetricsCollectorService,
  ): Promise<void> {
    this._metricsService = service;
    await this._registerToolCountGauge();
  }

  private async _registerToolCountGauge(): Promise<void> {
    // Clean up previous gauge callback if it exists
    if (this._metricsCallbackRef) {
      this._metricsCallbackRef.removeCallback();
      this._metricsCallbackRef = null;
    }

    if (!this._metricsService) return;

    try {
      this._metricsCallbackRef =
        await this._metricsService.addObservableCallback((asyncCollector) => {
          asyncCollector
            .gauge(
              'mashroom_mcp_tools_registered_count',
              'Number of currently registered MCP tools',
            )
            .set(getToolCount());
        });
      this.logger.info(
        'Metrics collector connected — reporting mashroom_mcp_tools_registered_count',
      );
    } catch (err) {
      this.logger.warn(
        `Could not register metrics callback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
