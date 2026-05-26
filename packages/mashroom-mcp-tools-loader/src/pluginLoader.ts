import type {
  MashroomLogger,
  MashroomLoggerFactory,
  MashroomPlugin,
  MashroomPluginConfig,
  MashroomPluginContextHolder,
  MashroomPluginLoader,
} from '@mashroom/mashroom/type-definitions';

export type ToolAccessType = 'read' | 'write' | 'admin';

export interface MCPToolAccessConfig {
  /**
   * Required roles to invoke this tool. If omitted, any authenticated user can call it for read tools.
   */
  roles?: string[];
  /**
   * Access type: read (data-only), write (modifies data), admin (admin operations).
   */
  type?: ToolAccessType;
}

export interface MCPToolPluginConfig {
  /**
   * Human-readable title for the tool (defaults to the plugin name).
   */
  title?: string;
  /**
   * Description of what the tool does.
   */
  description?: string;
  /**
   * Optional category label for grouping tools.
   * Example: "portal-service", "plugin-service".
   */
  category?: string;
  /**
   * Tool-level authorization configuration.
   */
  access?: MCPToolAccessConfig;
}

/**
 * Extended config passed to getTool() — includes the derived tool name
 * so implementations that share a bootstrap can route to the right handler.
 */
export interface MCPToolConfig
  extends MashroomPluginConfig,
    MCPToolPluginConfig {
  /**
   * The MCP tool name derived from the plugin name (lowercase, spaces -> underscores).
   */
  toolName: string;
}

export type MCPToolCallback<Args = any> = (
  args: Args,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

/**
 * The tool descriptor returned by an MCP tool plugin implementation.
 * Static metadata (name, title, description) is taken from the plugin's
 * mashroom.json config — only the callback and schemas come from code.
 */
export interface MCPToolDescriptor {
  /**
   * The tool handler. Required.
   */
  callback: MCPToolCallback;
  /**
   * JSON Schema (or Zod shape) for the tool input arguments.
   */
  inputSchema?: Record<string, unknown>;
  /**
   * JSON Schema (or Zod shape) for the tool output.
   */
  outputSchema?: Record<string, unknown>;
  /**
   * Optional MCP tool annotations.
   */
  annotations?: Record<string, unknown>;
  /**
   * Arbitrary metadata passed through to the MCP client.
   */
  _meta?: Record<string, unknown>;
}

export interface MCPToolPluginExport {
  /**
   * Called once when the plugin is loaded.
   * Returns a single tool descriptor. The tool name, title and description
   * are taken from the plugin's mashroom.json configuration.
   * The config.toolName holds the derived MCP tool name for routing.
   */
  getTool(
    config: MCPToolConfig,
    contextHolder: MashroomPluginContextHolder,
  ): MCPToolDescriptor;

  /**
   * Optional — called when the plugin is unloaded for cleanup.
   */
  cleanup?(): void;
}

export interface MCPToolRegistrationService {
  registerTool(
    pluginName: string,
    toolName: string,
    config: Record<string, unknown>,
    callback: MCPToolCallback,
  ): void;
  unregisterPluginTools(pluginName: string): void;
}

class LoadedPluginState {
  constructor(
    public plugin: MashroomPlugin,
    public config: MashroomPluginConfig,
    public contextHolder: MashroomPluginContextHolder,
  ) {}
}

class MCPToolLoader implements MashroomPluginLoader {
  name: string = 'Mashroom MCP Tool Loader';
  private _logger: MashroomLogger;
  private _loadedPlugins: Map<string, LoadedPluginState> = new Map();
  private _registrationService: MCPToolRegistrationService | null = null;

  constructor(
    loggerFactory: MashroomLoggerFactory,
    registrationService?: MCPToolRegistrationService | null,
  ) {
    this._logger = loggerFactory('mashroom.mcp.tool.loader');
    this._registrationService = registrationService ?? null;
  }

  /**
   * Set or update the tool registration service (injected by mashroom-mcp-services after bootstrap).
   */
  setRegistrationService(service: MCPToolRegistrationService): void {
    this._registrationService = service;
    this._logger.info('MCP tool registration service connected');
  }

  generateMinimumConfig(
    _plugin: MashroomPlugin,
  ): MashroomPluginConfig & MCPToolPluginConfig {
    return {
      title: '',
      description: '',
      category: 'default',
    };
  }

  async load(
    plugin: MashroomPlugin,
    config: MashroomPluginConfig,
    contextHolder: MashroomPluginContextHolder,
  ): Promise<void> {
    if (!this._registrationService) {
      this._logger.warn(
        `Cannot load plugin "${plugin.name}": no registration service available`,
      );
      return;
    }

    const pluginName = plugin.name;

    // If already loaded, unload first (config/plugin update scenario)
    if (this._loadedPlugins.has(pluginName)) {
      await this.unload(plugin);
    }

    this._logger.info(`Loading MCP tool plugin "${pluginName}"`);

    try {
      const bootstrap = plugin.requireBootstrap();
      // requireBootstrap() returns the default-exported function.
      // For MCP tool plugins that function is an async bootstrap returning
      // the MCPToolPluginExport object.
      let toolPlugin: MCPToolPluginExport;
      if (typeof bootstrap === 'function') {
        const result = await bootstrap();
        toolPlugin = result ?? {};
      } else {
        toolPlugin = bootstrap?.default ?? bootstrap ?? {};
      }

      if (!toolPlugin || typeof toolPlugin.getTool !== 'function') {
        throw new Error(
          `Plugin "${pluginName}" does not export a valid getTool function`,
        );
      }

      const pluginConfig = config as MCPToolPluginConfig;
      // Derive the MCP tool name from the plugin name: lowercase, spaces -> underscores
      const toolName = pluginName.toLowerCase().replace(/\s+/g, '_');
      const title = pluginConfig.title || pluginName;
      const description = pluginConfig.description || '';
      const category = pluginConfig.category;
      const access = pluginConfig.access;

      // Inject toolName into config so the implementation can route to the right handler
      const toolConfig: MCPToolConfig = {
        ...config,
        ...pluginConfig,
        toolName,
      };

      const tool = toolPlugin.getTool(toolConfig, contextHolder);

      this._registrationService.registerTool(
        pluginName,
        toolName,
        {
          title,
          description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
          _meta: tool._meta,
          category,
          access,
        },
        tool.callback,
      );
      this._logger.info(
        `  Registered tool "${toolName}" from plugin "${pluginName}"`,
      );

      this._loadedPlugins.set(
        pluginName,
        new LoadedPluginState(plugin, config, contextHolder),
      );
    } catch (err) {
      this._logger.error(
        `Failed to load MCP tool plugin "${pluginName}": ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async unload(plugin: MashroomPlugin): Promise<void> {
    const pluginName = plugin.name;

    this._logger.info(`Unloading MCP tool plugin "${pluginName}"`);

    // Call optional cleanup on the plugin
    try {
      const bootstrap = plugin.requireBootstrap();
      const toolPlugin: MCPToolPluginExport =
        typeof bootstrap === 'function'
          ? bootstrap
          : (bootstrap?.default ?? bootstrap);

      if (toolPlugin?.cleanup) {
        toolPlugin.cleanup();
      }
    } catch {
      // ignore cleanup errors
    }

    // Unregister all tools from this plugin via the registration service
    if (this._registrationService) {
      this._registrationService.unregisterPluginTools(pluginName);
    }

    this._loadedPlugins.delete(pluginName);
  }
}

export default MCPToolLoader;
