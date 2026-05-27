import type {
  MashroomLogger,
  MashroomPluginContextHolder,
} from '@mashroom/mashroom/type-definitions';
import type { MashroomPortalService } from '@mashroom/mashroom-portal/type-definitions';
import z from 'zod';
import {
  findSiteByPath,
  resolveTitle,
  sanitizeCss,
  sanitizeInput,
  sanitizePath,
} from '../helpers';
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
    .loggerFactory('mashroom.mcp-tools.page');
}

const toolMap = new Map<
  string,
  (contextHolder: MashroomPluginContextHolder) => MCPToolDescriptor
>();

// site_pages
toolMap.set('site_pages', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      sitePath: z.string().describe('Path (or part of the path) of the site'),
    },
    callback: async ({ sitePath }: { sitePath: string }) => {
      const sanitizedSitePath = sanitizePath(sitePath);
      log.debug(`site_pages called, sitePath=${sanitizedSitePath}`);
      const site = await findSiteByPath(portalService, sanitizedSitePath);
      if (!site) {
        return {
          content: [
            {
              type: 'text',
              text: `No site found matching path "${sanitizedSitePath}".`,
            },
          ],
        };
      }

      const lines = site.pages.map(
        (p, idx) =>
          `${idx}. [${p.pageId}] ${resolveTitle(p.title)} (friendlyUrl: ${p.friendlyUrl})`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Pages for site "${site.path}" (${site.pages.length}):\n====================\n\n${lines.join('\n')}`,
          },
        ],
      };
    },
  };
});

// get_page
toolMap.set('get_page', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: { pageId: z.string().describe('The page ID') },
    callback: async ({ pageId }: { pageId: string }) => {
      const sanitizedPageId = sanitizeInput(pageId, 256);
      log.debug(`get_page called, pageId=${sanitizedPageId}`);
      const page = await portalService.getPage(sanitizedPageId);
      if (!page) {
        return {
          content: [
            { type: 'text', text: `Page "${sanitizedPageId}" not found.` },
          ],
        };
      }

      let appsSummary = '(no apps assigned)';
      if (page.portalApps) {
        const appLines = Object.entries(page.portalApps).map(
          ([areaId, instances]) =>
            `  ${areaId}: ${instances.map((inst) => `${inst.pluginName}${inst.instanceId ? ` (${inst.instanceId})` : ''}`).join(', ')}`,
        );
        appsSummary = appLines.join('\n');
      }

      return {
        content: [
          {
            type: 'text',
            text:
              `Page details:\n====================\n` +
              `pageId: ${page.pageId}\n` +
              `description: ${page.description ?? '(none)'}\n` +
              `keywords: ${page.keywords ?? '(none)'}\n` +
              `theme: ${page.theme ?? '(site default)'}\n` +
              `layout: ${page.layout ?? '(site default)'}\n` +
              `extraCss: ${page.extraCss ?? '(none)'}\n` +
              `\nAssigned portal apps:\n${appsSummary}`,
          },
        ],
      };
    },
  };
});

// update_page
toolMap.set('update_page', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      pageId: z
        .string()
        .describe(
          'The page ID, page title, or friendly URL of the page to update',
        ),
      title: z.string().optional().describe('New page title'),
      description: z.string().optional().describe('New page description'),
      keywords: z
        .string()
        .optional()
        .describe('Comma-separated keywords for SEO'),
      theme: z
        .string()
        .optional()
        .describe('Theme override (or empty string to remove override)'),
      layout: z
        .string()
        .optional()
        .describe('Layout override (or empty string to remove override)'),
      extraCss: z
        .string()
        .optional()
        .describe('Extra CSS to inject on this page'),
    },
    callback: async (args: {
      pageId: string;
      title?: string;
      description?: string;
      keywords?: string;
      theme?: string;
      layout?: string;
      extraCss?: string;
    }) => {
      const { pageId, title, description, keywords, theme, layout, extraCss } =
        args;
      const sanitizedPageId = sanitizeInput(pageId, 256);
      const sanitizedTitle = title ? sanitizeInput(title) : undefined;
      const sanitizedDescription = description
        ? sanitizeInput(description)
        : undefined;
      const sanitizedKeywords = keywords
        ? sanitizeInput(keywords, 500)
        : undefined;
      const sanitizedTheme = theme ? sanitizeInput(theme) : undefined;
      const sanitizedLayout = layout ? sanitizeInput(layout) : undefined;
      const sanitizedExtraCss =
        extraCss !== undefined ? sanitizeCss(extraCss) : undefined;

      log.debug(`update_page called, pageId=${sanitizedPageId}`);
      let existing = await portalService.getPage(sanitizedPageId);
      let resolvedPageId = sanitizedPageId;
      let resolvedBy = '';

      if (!existing) {
        // Fallback: search all pages across all sites
        log.debug(
          `Page not found by ID "${sanitizedPageId}", searching by title/friendlyUrl...`,
        );
        const sites = await portalService.getSites();
        const query = sanitizedPageId.toLowerCase();
        const queryNoSlash = query.replace(/^\//, '');

        // Pass 1 – exact title match (case-insensitive)
        let match: { site: any; page: any } | null = null;
        for (const site of sites) {
          const found = site.pages.find((p: any) => {
            const pageTitle = resolveTitle(p.title).toLowerCase();
            return pageTitle === query;
          });
          if (found) {
            match = { site, page: found };
            resolvedBy = 'title';
            break;
          }
        }

        // Pass 2 – exact friendlyUrl match (case-insensitive)
        if (!match) {
          for (const site of sites) {
            const found = site.pages.find((p: any) => {
              const fu = (p.friendlyUrl ?? '').toLowerCase();
              return fu === query || fu === queryNoSlash;
            });
            if (found) {
              match = { site, page: found };
              resolvedBy = 'friendlyUrl';
              break;
            }
          }
        }

        // Pass 3 – partial title match (case-insensitive, longest match wins)
        if (!match) {
          let bestMatch: { site: any; page: any; score: number } | null = null;
          for (const site of sites) {
            for (const p of site.pages) {
              const pageTitle = resolveTitle(p.title).toLowerCase();
              if (pageTitle.includes(query) || query.includes(pageTitle)) {
                const score = Math.min(pageTitle.length, query.length);
                if (!bestMatch || score > bestMatch.score) {
                  bestMatch = { site, page: p, score };
                }
              }
            }
          }
          if (bestMatch) {
            match = { site: bestMatch.site, page: bestMatch.page };
            resolvedBy = 'partial title';
          }
        }

        // Pass 4 – partial pageId match (case-insensitive)
        if (!match) {
          for (const site of sites) {
            const found = site.pages.find((p: any) =>
              p.pageId.toLowerCase().includes(query),
            );
            if (found) {
              match = { site, page: found };
              resolvedBy = 'partial pageId';
              break;
            }
          }
        }

        if (match) {
          existing = await portalService.getPage(match.page.pageId);
          resolvedPageId = match.page.pageId;
          log.debug(
            `Found page by ${resolvedBy}: "${sanitizedPageId}" -> pageId="${resolvedPageId}"`,
          );
        }
      }

      if (!existing) {
        // List available pages to help the caller
        const sites = await portalService.getSites();
        const allPages: string[] = [];
        for (const site of sites) {
          for (const p of site.pages) {
            allPages.push(
              `  [${p.pageId}] ${resolveTitle(p.title)} (friendlyUrl: ${p.friendlyUrl})`,
            );
          }
        }
        return {
          content: [
            {
              type: 'text',
              text:
                `Page "${sanitizedPageId}" not found.\n\n` +
                `Available pages:\n${allPages.join('\n')}`,
            },
          ],
        };
      }

      // Title lives on the PageRef (inside site.pages[]), NOT on MashroomPortalPage.
      if (sanitizedTitle !== undefined) {
        const sites = await portalService.getSites();
        for (const site of sites) {
          const ref = site.pages.find((p) => p.pageId === resolvedPageId);
          if (ref) {
            const newTitleValue =
              typeof ref.title === 'string'
                ? sanitizedTitle
                : { ...ref.title, en: sanitizedTitle };
            const updatedPages = site.pages.map((p) =>
              p.pageId === resolvedPageId ? { ...p, title: newTitleValue } : p,
            );
            await portalService.updateSite({ ...site, pages: updatedPages });
            break;
          }
        }
      }

      // Update the page data record
      const update: Record<string, unknown> = { pageId: resolvedPageId };
      if (sanitizedDescription !== undefined)
        update.description = sanitizedDescription;
      if (sanitizedKeywords !== undefined) update.keywords = sanitizedKeywords;
      if (sanitizedTheme !== undefined) update.theme = sanitizedTheme;
      if (sanitizedLayout !== undefined) update.layout = sanitizedLayout;
      if (sanitizedExtraCss !== undefined) update.extraCss = sanitizedExtraCss;

      const hasPageUpdates = Object.keys(update).length > 1;
      if (hasPageUpdates) {
        await portalService.updatePage({ ...existing, ...update } as any);
      }

      const resolvedNote = resolvedBy
        ? ` (resolved by ${resolvedBy} to pageId "${resolvedPageId}")`
        : '';
      return {
        content: [
          {
            type: 'text',
            text: `Page "${resolvedPageId}" updated successfully.${resolvedNote}`,
          },
        ],
      };
    },
  };
});

// insert_page
toolMap.set('insert_page', (contextHolder) => {
  const portalService = contextHolder.getPluginContext().services.portal
    ?.service as MashroomPortalService;
  const log = createLogger(contextHolder);

  return {
    inputSchema: {
      sitePath: z
        .string()
        .describe('Path of the site to add the page to (e.g. /web)'),
      newPageId: z.string().describe('ID of the new page'),
      newTitle: z.string().describe('Display title for the page'),
      friendlyUrl: z
        .string()
        .optional()
        .describe(
          'Friendly URL path for the page (e.g. /about). Defaults to /<pageId>.',
        ),
      newDescription: z
        .string()
        .optional()
        .describe('Description for the new page'),
      theme: z.string().optional().describe('Theme override for this page'),
      layout: z.string().optional().describe('Layout override for this page'),
    },
    callback: async (args: {
      sitePath: string;
      newPageId: string;
      newTitle: string;
      friendlyUrl?: string;
      newDescription?: string;
      theme?: string;
      layout?: string;
    }) => {
      const {
        sitePath,
        newPageId,
        newTitle,
        friendlyUrl,
        newDescription,
        theme,
        layout,
      } = args;
      const sanitizedSitePath = sanitizePath(sitePath);
      const sanitizedNewPageId = sanitizeInput(newPageId, 256);
      const sanitizedNewTitle = sanitizeInput(newTitle);
      const sanitizedFriendlyUrl = friendlyUrl
        ? sanitizePath(friendlyUrl)
        : undefined;
      const sanitizedDesc = newDescription
        ? sanitizeInput(newDescription)
        : undefined;
      const sanitizedTheme = theme ? sanitizeInput(theme) : undefined;
      const sanitizedLayout = layout ? sanitizeInput(layout) : undefined;

      log.debug(
        `insert_page called, sitePath=${sanitizedSitePath}, newPageId=${sanitizedNewPageId}`,
      );
      const site = await findSiteByPath(portalService, sanitizedSitePath);
      if (!site) {
        return {
          content: [
            {
              type: 'text',
              text: `Site matching path "${sanitizedSitePath}" not found.`,
            },
          ],
        };
      }

      await portalService.insertPage({
        pageId: sanitizedNewPageId,
        ...(sanitizedDesc !== undefined && { description: sanitizedDesc }),
        ...(sanitizedTheme !== undefined && { theme: sanitizedTheme }),
        ...(sanitizedLayout !== undefined && { layout: sanitizedLayout }),
      });

      const pageRef = {
        pageId: sanitizedNewPageId,
        title: sanitizedNewTitle,
        friendlyUrl: sanitizedFriendlyUrl ?? `/${sanitizedNewPageId}`,
      };
      await portalService.updateSite({
        ...site,
        pages: [...site.pages, pageRef],
      });

      return {
        content: [
          {
            type: 'text',
            text: `Page "${sanitizedNewPageId}" created and added to site "${site.path}" at friendlyUrl "${pageRef.friendlyUrl}".`,
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
      throw new Error(`Unknown page tool: "${toolName}"`);
    }

    return factory(contextHolder);
  },
};

export default async () => toolPlugin;
