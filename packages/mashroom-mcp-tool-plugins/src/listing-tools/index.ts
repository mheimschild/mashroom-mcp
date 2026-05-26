import type { MashroomLogger, MashroomPluginContextHolder } from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalService } from '@mashroom/mashroom-portal/type-definitions';
import type { MCPToolPluginExport, MCPToolDescriptor, MCPToolConfig } from '../types';
import { resolveTitle } from '../helpers';

function createLogger(contextHolder: MashroomPluginContextHolder): MashroomLogger {
  return contextHolder.getPluginContext().loggerFactory('mashroom.mcp-tools.listing');
}

const toolMap = new Map<string, (contextHolder: MashroomPluginContextHolder) => MCPToolDescriptor>();

// portal_apps
toolMap.set('portal_apps', (contextHolder) => {
  const portalService = contextHolder
    .getPluginContext()
    .services.portal?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('portal_apps called');
      const apps = portalService.getPortalApps();
      if (apps.length === 0) {
        return { content: [{ type: 'text', text: 'No portal apps registered.' }] };
      }
      const lines = apps.map(
        (app, idx) =>
          `${idx + 1}. ${app.name}\n   description: ${resolveTitle(app.description)}\n   version: ${app.version}\n   category: ${app.category ?? '(none)'}\n   remote: ${app.remoteApp}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Portal apps (${apps.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// portal_themes
toolMap.set('portal_themes', (contextHolder) => {
  const portalService = contextHolder
    .getPluginContext()
    .services.portal?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('portal_themes called');
      const themes = portalService.getThemes();
      if (themes.length === 0) {
        return { content: [{ type: 'text', text: 'No portal themes registered.' }] };
      }
      const lines = themes.map(
        (t, idx) =>
          `${idx + 1}. ${t.name}\n   description: ${t.description ?? '(none)'}\n   version: ${t.version}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Portal themes (${themes.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// portal_layouts
toolMap.set('portal_layouts', (contextHolder) => {
  const portalService = contextHolder
    .getPluginContext()
    .services.portal?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('portal_layouts called');
      const layouts = portalService.getLayouts();
      if (layouts.length === 0) {
        return { content: [{ type: 'text', text: 'No portal layouts registered.' }] };
      }
      const lines = layouts.map(
        (l, idx) =>
          `${idx + 1}. ${l.name}\n   layoutId: ${l.layoutId}\n   description: ${l.description ?? '(none)'}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Portal layouts (${layouts.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// page_enhancements
toolMap.set('page_enhancements', (contextHolder) => {
  const portalService = contextHolder
    .getPluginContext()
    .services.portal?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('page_enhancements called');
      const enhancements = portalService.getPortalPageEnhancements();
      if (enhancements.length === 0) {
        return { content: [{ type: 'text', text: 'No page enhancements registered.' }] };
      }
      const lines = enhancements.map(
        (e, idx) =>
          `${idx + 1}. ${e.name}\n   description: ${e.description ?? '(none)'}\n   version: ${e.version}\n   order: ${e.order}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Page enhancements (${enhancements.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// app_enhancements
toolMap.set('app_enhancements', (contextHolder) => {
  const portalService = contextHolder
    .getPluginContext()
    .services.portal?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('app_enhancements called');
      const enhancements = portalService.getPortalAppEnhancements();
      if (enhancements.length === 0) {
        return { content: [{ type: 'text', text: 'No app enhancements registered.' }] };
      }
      const lines = enhancements.map(
        (e, idx) =>
          `${idx + 1}. ${e.name}\n   description: ${e.description ?? '(none)'}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `App enhancements (${enhancements.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

const toolPlugin: MCPToolPluginExport = {
  getTool(_config, contextHolder) {
    const portalService = contextHolder
      .getPluginContext()
      .services.portal?.service as MashroomPortalService | undefined;

    if (!portalService) {
      throw new Error('Mashroom Portal service not available');
    }

    // toolName is injected by the loader from the plugin name
    const toolName = (_config as MCPToolConfig).toolName;
    const factory = toolMap.get(toolName);
    if (!factory) {
      throw new Error(`Unknown listing tool: "${toolName}"`);
    }

    return factory(contextHolder);
  },
};

export default async () => toolPlugin;
