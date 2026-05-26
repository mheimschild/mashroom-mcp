import type { MashroomLogger, MashroomPluginContextHolder, MashroomPluginService, MashroomPluginPackage } from '@mashroom/mashroom/type-definitions';
import z from 'zod';
import type { MCPToolPluginExport, MCPToolDescriptor, MCPToolConfig } from '../types';

function createLogger(contextHolder: MashroomPluginContextHolder): MashroomLogger {
  return contextHolder.getPluginContext().loggerFactory('mashroom.mcp-tools.plugin');
}

const toolMap = new Map<string, (contextHolder: MashroomPluginContextHolder) => MCPToolDescriptor>();

// list_plugins
toolMap.set('list_plugins', (contextHolder) => {
  const pluginService = contextHolder
    .getPluginContext()
    .services.core.pluginService as MashroomPluginService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('list_plugins called');
      const plugins = pluginService.getPlugins();
      if (plugins.length === 0) {
        return { content: [{ type: 'text', text: 'No plugins loaded.' }] };
      }
      const lines = plugins.map(
        (p, idx) =>
          `${idx + 1}. ${p.name}\n   type: ${p.type}\n   status: ${p.status}\n   package: ${p.pluginPackage.name}@${p.pluginPackage.version}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Plugins (${plugins.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// get_plugin
toolMap.set('get_plugin', (contextHolder) => {
  const pluginService = contextHolder
    .getPluginContext()
    .services.core.pluginService as MashroomPluginService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: { pluginName: z.string().describe('The exact plugin name as shown in list_plugins') },
    callback: async ({ pluginName }: { pluginName: string }) => {
      log.debug(`get_plugin called, pluginName=${pluginName}`);
      const plugins = pluginService.getPlugins();
      const plugin = plugins.find((p) => p.name === pluginName);
      if (!plugin) {
        return { content: [{ type: 'text', text: `Plugin "${pluginName}" not found.` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text:
              `Plugin details:\n====================\n` +
              `name: ${plugin.name}\n` +
              `type: ${plugin.type}\n` +
              `status: ${plugin.status}\n` +
              `description: ${plugin.description ?? '(none)'}\n` +
              `tags: ${plugin.tags.length > 0 ? plugin.tags.join(', ') : '(none)'}\n` +
              `lastReloadTs: ${plugin.lastReloadTs ?? '(never reloaded)'}\n` +
              `errorMessage: ${plugin.errorMessage ?? '(none)'}\n` +
              `\nConfig:\n${plugin.config ? JSON.stringify(plugin.config, null, 2) : '(not loaded yet)'}\n` +
              `\nPackage:\n${formatPluginPackage(plugin.pluginPackage)}`,
          },
        ],
      };
    },
  };
});

// list_plugin_packages
toolMap.set('list_plugin_packages', (contextHolder) => {
  const pluginService = contextHolder
    .getPluginContext()
    .services.core.pluginService as MashroomPluginService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('list_plugin_packages called');
      const packages = pluginService.getPluginPackages();
      if (packages.length === 0) {
        return { content: [{ type: 'text', text: 'No plugin packages found.' }] };
      }
      const lines = packages.map(
        (pkg, idx) =>
          `${idx + 1}. ${pkg.name}@${pkg.version}\n   status: ${pkg.status}\n   description: ${pkg.description ?? '(none)'}\n   plugins: ${pkg.pluginDefinitions.length}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Plugin packages (${packages.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// get_plugin_package
toolMap.set('get_plugin_package', (contextHolder) => {
  const pluginService = contextHolder
    .getPluginContext()
    .services.core.pluginService as MashroomPluginService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: { packageName: z.string().describe('The exact npm package name (e.g. @mashroom/mashroom-portal)') },
    callback: async ({ packageName }: { packageName: string }) => {
      log.debug(`get_plugin_package called, packageName=${packageName}`);
      const packages = pluginService.getPluginPackages();
      const pkg = packages.find((p) => p.name === packageName);
      if (!pkg) {
        return { content: [{ type: 'text', text: `Package "${packageName}" not found.` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: formatPluginPackage(pkg),
          },
        ],
      };
    },
  };
});

// list_plugin_loaders
toolMap.set('list_plugin_loaders', (contextHolder) => {
  const pluginService = contextHolder
    .getPluginContext()
    .services.core.pluginService as MashroomPluginService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('list_plugin_loaders called');
      const loaders = pluginService.getPluginLoaders();
      const entries = Object.entries(loaders);
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: 'No plugin loaders registered.' }] };
      }
      const lines = entries.map(
        ([pluginType, loader], idx) =>
          `${idx + 1}. ${pluginType}\n   loader: ${loader?.name ?? '(none)'}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Plugin loaders (${entries.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// plugins_by_type
toolMap.set('plugins_by_type', (contextHolder) => {
  const pluginService = contextHolder
    .getPluginContext()
    .services.core.pluginService as MashroomPluginService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      pluginType: z.string().describe('The exact plugin type to filter by (e.g. web-app, api, middleware, services, storage)'),
    },
    callback: async ({ pluginType }: { pluginType: string }) => {
      log.debug(`plugins_by_type called, pluginType=${pluginType}`);
      const plugins = pluginService.getPlugins();
      const filtered = plugins.filter((p) => p.type === pluginType);
      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No plugins found with type "${pluginType}".` }] };
      }
      const lines = filtered.map(
        (p, idx) =>
          `${idx + 1}. ${p.name}\n   status: ${p.status}\n   package: ${p.pluginPackage.name}@${p.pluginPackage.version}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Plugins of type "${pluginType}" (${filtered.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

const toolPlugin: MCPToolPluginExport = {
  getTool(_config, contextHolder) {
    const pluginService = contextHolder
      .getPluginContext()
      .services.core.pluginService as MashroomPluginService | undefined;

    if (!pluginService) {
      throw new Error('Mashroom Plugin Service not available');
    }

    const toolName = (_config as MCPToolConfig).toolName;
    const factory = toolMap.get(toolName);
    if (!factory) {
      throw new Error(`Unknown plugin tool: "${toolName}"`);
    }

    return factory(contextHolder);
  },
};

function formatPluginPackage(pkg: MashroomPluginPackage): string {
  const pluginList = pkg.pluginDefinitions.map((def) => `  - ${def.name}${def.description ? ` (${def.description})` : ''}`).join('\n');
  return [
    `name: ${pkg.name}`,
    `version: ${pkg.version}`,
    `description: ${pkg.description ?? '(none)'}`,
    `homepage: ${pkg.homepage ?? '(none)'}`,
    `author: ${pkg.author ?? '(none)'}`,
    `license: ${pkg.license ?? '(none)'}`,
    `status: ${pkg.status}`,
    `path: ${pkg.pluginPackagePath}`,
    pkg.errorMessage ? `error: ${pkg.errorMessage}` : null,
    `\nContained plugins (${pkg.pluginDefinitions.length}):\n${pluginList || '  (none)'}`,
  ].filter(Boolean).join('\n');
}

export default async () => toolPlugin;
