import type {
  MashroomLogger,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalService } from '@mashroom/mashroom-portal/type-definitions';
import z from 'zod';
import { sanitizeInput, sanitizeJson } from '../helpers';
import type {
  MCPToolConfig,
  MCPToolDescriptor,
  MCPToolPluginExport,
} from '../types';

function createLogger(
  contextHolder: MashroomPluginContextHolder,
): MashroomLogger {
  return contextHolder
    .getPluginContext()
    .loggerFactory('mashroom.mcp-tools.app-instance');
}

const toolMap = new Map<
  string,
  (contextHolder: MashroomPluginContextHolder) => MCPToolDescriptor
>();

// get_app_instance
toolMap.set('get_app_instance', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      pluginName: z.string().describe('The portal app plugin name'),
      instanceId: z
        .string()
        .optional()
        .describe('The instance ID (omit for singleton apps)'),
    },
    callback: async (args: { pluginName: string; instanceId?: string }) => {
      const { pluginName, instanceId } = args;
      const sanitizedPluginName = sanitizeInput(pluginName, 256);
      const sanitizedInstanceId = instanceId
        ? sanitizeInput(instanceId, 256)
        : undefined;
      log.debug(
        `get_app_instance called, pluginName=${sanitizedPluginName}, instanceId=${sanitizedInstanceId ?? '(singleton)'}`,
      );
      const instance = await portalService.getPortalAppInstance(
        sanitizedPluginName,
        sanitizedInstanceId ?? null,
      );
      if (!instance) {
        return {
          content: [
            {
              type: 'text',
              text: `App instance "${pluginName}"${instanceId ? ` (${instanceId})` : ''} not found.`,
            },
          ],
        };
      }

      const configStr = instance.appConfig
        ? JSON.stringify(instance.appConfig, null, 2)
        : '(no custom config)';
      return {
        content: [
          {
            type: 'text',
            text:
              `App instance:\n====================\n` +
              `pluginName: ${instance.pluginName}\n` +
              `instanceId: ${instance.instanceId ?? '(singleton)'}\n\n` +
              `appConfig:\n${configStr}`,
          },
        ],
      };
    },
  };
});

// update_app_instance
toolMap.set('update_app_instance', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      pluginName: z.string().describe('The portal app plugin name'),
      instanceId: z
        .string()
        .optional()
        .describe('The instance ID (omit for singleton apps)'),
      appConfigJson: z.string().describe('New app config as a JSON string'),
    },
    callback: async (args: {
      pluginName: string;
      instanceId?: string;
      appConfigJson: string;
    }) => {
      const { pluginName, instanceId, appConfigJson } = args;
      const sanitizedPluginName = sanitizeInput(pluginName, 256);
      const sanitizedInstanceId = instanceId
        ? sanitizeInput(instanceId, 256)
        : undefined;
      log.debug(
        `update_app_instance called, pluginName=${sanitizedPluginName}, instanceId=${sanitizedInstanceId ?? '(singleton)'}`,
      );
      const existing = await portalService.getPortalAppInstance(
        sanitizedPluginName,
        sanitizedInstanceId ?? null,
      );
      if (!existing) {
        return {
          content: [
            {
              type: 'text',
              text: `App instance "${sanitizedPluginName}"${sanitizedInstanceId ? ` (${sanitizedInstanceId})` : ''} not found.`,
            },
          ],
        };
      }

      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = sanitizeJson(appConfigJson);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid JSON for appConfig: ${err instanceof Error ? err.message : 'invalid input'}`,
            },
          ],
        };
      }

      await portalService.updatePortalAppInstance({
        ...existing,
        appConfig: parsedConfig,
      });

      return {
        content: [
          {
            type: 'text',
            text: `App instance "${sanitizedPluginName}"${sanitizedInstanceId ? ` (${sanitizedInstanceId})` : ''} updated.`,
          },
        ],
      };
    },
  };
});

const toolPlugin: MCPToolPluginExport = {
  getTool(_config, contextHolder) {
    const portalService = contextHolder.getPluginContext().services.portal
      ?.service as MashroomPortalService | undefined;

    if (!portalService) {
      throw new Error('Mashroom Portal service not available');
    }

    const toolName = (_config as MCPToolConfig).toolName;
    const factory = toolMap.get(toolName);
    if (!factory) {
      throw new Error(`Unknown app-instance tool: "${toolName}"`);
    }

    return factory(contextHolder);
  },
};

export default async () => toolPlugin;
