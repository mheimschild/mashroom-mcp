import type {
  MashroomLogger,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalService } from '@mashroom/mashroom-portal/type-definitions';
import z from 'zod';
import { resolveTitle, sanitizeInput, sanitizePath } from '../helpers';
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
    .loggerFactory('mashroom.mcp-tools.site');
}

const toolMap = new Map<
  string,
  (contextHolder: MashroomPluginContextHolder) => MCPToolDescriptor
>();

// portal_sites
toolMap.set('portal_sites', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    callback: async () => {
      log.debug('portal_sites called');
      const sites = await portalService.getSites();
      if (sites.length === 0) {
        return { content: [{ type: 'text', text: 'No sites registered.' }] };
      }
      const lines = sites.map(
        (s, idx) =>
          `${idx + 1}. ${s.path}\n   title: ${resolveTitle(s.title)}\n   pages: ${s.pages.length}\n   defaultTheme: ${s.defaultTheme ?? '(none)'}\n   defaultLayout: ${s.defaultLayout ?? '(none)'}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Sites (${sites.length}):\n====================\n\n${lines.join('\n----------------------\n')}`,
          },
        ],
      };
    },
  };
});

// get_site
toolMap.set('get_site', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: { siteId: z.string().describe('The site ID') },
    callback: async ({ siteId }: { siteId: string }) => {
      const sanitizedSiteId = sanitizeInput(siteId, 256);
      log.debug(`get_site called, siteId=${sanitizedSiteId}`);
      const site = await portalService.getSite(sanitizedSiteId);
      if (!site) {
        return {
          content: [
            { type: 'text', text: `Site "${sanitizedSiteId}" not found.` },
          ],
        };
      }
      const pagesSummary = site.pages
        .map(
          (p, idx) =>
            `${idx}. [${p.pageId}] ${resolveTitle(p.title)} (friendlyUrl: ${p.friendlyUrl})`,
        )
        .join('\n');
      return {
        content: [
          {
            type: 'text',
            text:
              `Site details:\n====================\n` +
              `siteId: ${site.siteId}\n` +
              `title: ${resolveTitle(site.title)}\n` +
              `path: ${site.path}\n` +
              `defaultTheme: ${site.defaultTheme ?? '(none)'}\n` +
              `defaultLayout: ${site.defaultLayout ?? '(none)'}\n` +
              `virtualHosts: ${site.virtualHosts?.join(', ') ?? '(none)'}\n` +
              `\nPages (${site.pages.length}):\n${pagesSummary || '(no pages)'}`,
          },
        ],
      };
    },
  };
});

// update_site
toolMap.set('update_site', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      siteId: z.string().describe('The site ID to update'),
      title: z.string().optional().describe('New site title'),
      path: z.string().optional().describe('New site path'),
      defaultTheme: z
        .string()
        .optional()
        .describe('Default theme for the site'),
      defaultLayout: z
        .string()
        .optional()
        .describe('Default layout for the site'),
    },
    callback: async (args: {
      siteId: string;
      title?: string;
      path?: string;
      defaultTheme?: string;
      defaultLayout?: string;
    }) => {
      const { siteId, title, path, defaultTheme, defaultLayout } = args;
      const sanitizedSiteId = sanitizeInput(siteId, 256);
      const sanitizedPath = path ? sanitizePath(path) : undefined;
      const sanitizedTitle = title ? sanitizeInput(title) : undefined;
      log.debug(
        `update_site called, siteId=${sanitizedSiteId}, title=${sanitizedTitle ?? '(not set)'}, path=${sanitizedPath ?? '(not set)'}`,
      );
      const existing = await portalService.getSite(sanitizedSiteId);
      if (!existing) {
        return {
          content: [
            { type: 'text', text: `Site "${sanitizedSiteId}" not found.` },
          ],
        };
      }

      const updatedTitle = sanitizedTitle
        ? typeof existing.title === 'string'
          ? sanitizedTitle
          : { ...existing.title, en: sanitizedTitle }
        : existing.title;

      await portalService.updateSite({
        ...existing,
        ...(sanitizedTitle !== undefined && { title: updatedTitle }),
        ...(sanitizedPath !== undefined && { path: sanitizedPath }),
        ...(defaultTheme !== undefined && {
          defaultTheme: sanitizeInput(defaultTheme),
        }),
        ...(defaultLayout !== undefined && {
          defaultLayout: sanitizeInput(defaultLayout),
        }),
      });

      return {
        content: [
          {
            type: 'text',
            text: `Site "${sanitizedSiteId}" updated successfully.`,
          },
        ],
      };
    },
  };
});

// insert_site
toolMap.set('insert_site', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      newSiteId: z.string().describe('ID of the new site'),
      newTitle: z.string().describe('Title of the new site'),
      newPath: z.string().describe('URL path of the new site (e.g. /my-site)'),
      defaultTheme: z
        .string()
        .optional()
        .describe('Default theme name for the site'),
      defaultLayout: z
        .string()
        .optional()
        .describe('Default layout name for the site'),
    },
    callback: async (args: {
      newSiteId: string;
      newTitle: string;
      newPath: string;
      defaultTheme?: string;
      defaultLayout?: string;
    }) => {
      const { newSiteId, newTitle, newPath, defaultTheme, defaultLayout } =
        args;
      const sanitizedSiteId = sanitizeInput(newSiteId, 256);
      const sanitizedNewTitle = sanitizeInput(newTitle);
      const sanitizedNewPath = sanitizePath(newPath);
      log.debug(
        `insert_site called, newSiteId=${sanitizedSiteId}, newTitle=${sanitizedNewTitle}, newPath=${sanitizedNewPath}`,
      );
      await portalService.insertSite({
        siteId: sanitizedSiteId,
        title: sanitizedNewTitle,
        path: sanitizedNewPath,
        ...(defaultTheme !== undefined && {
          defaultTheme: sanitizeInput(defaultTheme),
        }),
        ...(defaultLayout !== undefined && {
          defaultLayout: sanitizeInput(defaultLayout),
        }),
        pages: [],
      });

      return {
        content: [
          {
            type: 'text',
            text: `Site "${sanitizedSiteId}" created at path "${sanitizedNewPath}".`,
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
      throw new Error(`Unknown site tool: "${toolName}"`);
    }

    return factory(contextHolder);
  },
};

export default async () => toolPlugin;
