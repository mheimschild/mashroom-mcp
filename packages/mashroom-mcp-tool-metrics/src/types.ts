import type {
  MashroomPluginConfig,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';

/**
 * The tool descriptor returned by an MCP tool plugin implementation.
 */
export interface MCPToolDescriptor {
  callback: (...args: any[]) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface MCPToolPluginExport {
  getTool(
    config: MashroomPluginConfig,
    contextHolder: MashroomPluginContextHolder,
  ): MCPToolDescriptor;
  cleanup?(): void;
}

/**
 * Extended config passed to getTool() — includes the derived tool name.
 */
export interface MCPToolConfig extends MashroomPluginConfig {
  toolName: string;
}
