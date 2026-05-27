import type {
  MashroomPluginConfig,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';

/**
 * The tool descriptor returned by an MCP tool plugin implementation.
 * Static metadata (name, title, description) is taken from the plugin's
 * mashroom.json config — only the callback and schemas come from code.
 */
export interface MCPToolDescriptor {
  /**
   * The tool handler. Required.
   */
  callback: (...args: any[]) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
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

export interface MCPToolPluginExport {
  /**
   * Called once when the plugin is loaded.
   * Returns a single tool descriptor. The tool name, title and description
   * are taken from the plugin's mashroom.json configuration.
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
