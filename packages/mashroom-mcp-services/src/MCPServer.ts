import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function setSessionRoles(sessionId: string, roles: string[]): void {
  sessionRoles.set(sessionId, roles);
}

export function clearSessionRoles(sessionId: string): void {
  sessionRoles.delete(sessionId);
}

/**
 * Maps session IDs to their caller's roles.
 */
const sessionRoles: Map<string, string[]> = new Map();

/**
 * Session TTL configuration (in milliseconds). Default: 30 minutes.
 */
let sessionTTLms = 30 * 60 * 1000;
const sessionLastActivity: Map<string, number> = new Map();

export function setSessionTTL(seconds: number): void {
  sessionTTLms = seconds * 1000;
}

/**
 * Update the last activity timestamp for a session.
 */
export function touchSession(sessionId: string): void {
  sessionLastActivity.set(sessionId, Date.now());
}

/**
 * Clean up expired sessions by removing their servers and roles.
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [sid, lastActive] of sessionLastActivity.entries()) {
    if (now - lastActive > sessionTTLms && activeServers.has(sid)) {
      auditLogFn(
        `SESSION_EXPIRED: session=${sid}, idle=${Math.round((now - lastActive) / 1000)}s`,
      );
      clearSessionRoles(sid);
      removeServer(sid);
      sessionLastActivity.delete(sid);
      cleaned++;
    }
  }
  return cleaned;
}

export interface ToolRegistration {
  tool: RegisteredTool;
  sourcePluginName: string;
  category?: string;
}

export type ToolAccessType = 'read' | 'write' | 'admin';

export interface MCPToolAccessConfig {
  roles?: string[];
  type?: ToolAccessType;
}

export interface StoredToolDefinition {
  toolName: string;
  pluginName: string;
  category?: string;
  config: Record<string, unknown>;
  callback: (...args: any[]) => Promise<any>;
  access?: MCPToolAccessConfig;
}

export type ToolChangeCallback = (
  action: 'added' | 'removed',
  pluginName: string,
) => void;

/**
 * Server metadata used when creating McpServer instances.
 */
const SERVER_METADATA = {
  name: 'mashroom-mcp-server',
  version: '1.0.0',
  icons: [] as {
    src: string;
    mimeType?: string;
    sizes?: string[];
    theme?: 'light' | 'dark';
  }[],
  websiteUrl: 'https://github.com/mheimschild/mashroom-mcp',
};

/**
 * Server capabilities used when creating McpServer instances.
 */
const SERVER_CAPABILITIES = {
  logging: {},
  tasks: { requests: { tools: { call: {} } } },
};

/**
 * Global store of all tool definitions so they can be replayed onto new McpServer instances.
 */
const storedToolDefinitions: Map<string, StoredToolDefinition> = new Map();

/**
 * Per-server map of registered tools (sessionId -> toolName -> RegisteredTool).
 */
const serverTools: Map<string, Map<string, RegisteredTool>> = new Map();

const changeListeners: ToolChangeCallback[] = [];

export function onToolChange(listener: ToolChangeCallback): void {
  changeListeners.push(listener);
}

export function removeToolChangeListener(listener: ToolChangeCallback): void {
  const idx = changeListeners.indexOf(listener);
  if (idx >= 0) {
    changeListeners.splice(idx, 1);
  }
}

function notifyChange(action: 'added' | 'removed', pluginName: string): void {
  for (const listener of [...changeListeners]) {
    listener(action, pluginName);
  }
}

/**
 * Register a tool on all active McpServer instances.
 */
export function registerToolFromPlugin(
  pluginName: string,
  toolName: string,
  config: Record<string, unknown>,
  callback: (...args: any[]) => Promise<any>,
): RegisteredTool | null {
  const category =
    config && 'category' in config ? (config.category as string) : undefined;
  const accessRaw =
    config && 'access' in config
      ? (config.access as Record<string, unknown> | undefined)
      : undefined;
  const access: MCPToolAccessConfig | undefined = accessRaw
    ? {
        roles: Array.isArray(accessRaw.roles)
          ? (accessRaw.roles as string[])
          : undefined,
        type:
          accessRaw.type &&
          ['read', 'write', 'admin'].includes(accessRaw.type as string)
            ? (accessRaw.type as ToolAccessType)
            : undefined,
      }
    : undefined;

  // Store the definition for replay on future servers
  const stored: StoredToolDefinition = {
    toolName,
    pluginName,
    category,
    config,
    callback,
    access,
  };

  // If a tool with this name already exists globally, remove it from all active servers first
  if (storedToolDefinitions.has(toolName)) {
    const existingDef = storedToolDefinitions.get(toolName)!;
    removeToolFromAllServers(toolName);
    notifyChange('removed', existingDef.pluginName);
  }

  storedToolDefinitions.set(toolName, stored);

  // Include access info in _meta so clients can see it
  const enrichedConfig = enrichToolConfig(config, access);

  // Register on all currently active servers
  let firstRegistration: RegisteredTool | null = null;
  for (const [sid, server] of activeServers.entries()) {
    if (!serverTools.has(sid)) {
      serverTools.set(sid, new Map());
    }
    const tools = serverTools.get(sid)!;

    const wrappedCallback = createAuthWrappedCallback(
      sid,
      toolName,
      stored,
      callback,
    );
    const registeredTool = server.registerTool(
      toolName,
      enrichedConfig as Parameters<McpServer['registerTool']>[1],
      wrappedCallback as Parameters<McpServer['registerTool']>[2],
    );

    tools.set(toolName, registeredTool);
    if (!firstRegistration) {
      firstRegistration = registeredTool;
    }
  }

  if (firstRegistration) {
    notifyChange('added', pluginName);
    return firstRegistration;
  }

  // No active servers yet — tool is stored and will be applied when servers are created.
  return null;
}

function removeToolFromAllServers(toolName: string): void {
  for (const [, tools] of serverTools.entries()) {
    const existing = tools.get(toolName);
    if (existing) {
      existing.remove();
      tools.delete(toolName);
    }
  }
}

function enrichToolConfig(
  config: Record<string, unknown>,
  access?: MCPToolAccessConfig,
): Record<string, unknown> {
  const enriched = { ...config };
  if (!enriched._meta) {
    enriched._meta = {};
  }
  (enriched._meta as Record<string, unknown>).access = access;
  return enriched;
}

export function unregisterToolsFromPlugin(pluginName: string): void {
  const toolsToRemove: string[] = [];
  for (const [toolName, def] of storedToolDefinitions.entries()) {
    if (def.pluginName === pluginName) {
      toolsToRemove.push(toolName);
    }
  }

  for (const toolName of toolsToRemove) {
    const def = storedToolDefinitions.get(toolName)!;
    removeToolFromAllServers(toolName);
    storedToolDefinitions.delete(toolName);
    notifyChange('removed', def.pluginName);
  }
}

export function getToolCount(): number {
  return storedToolDefinitions.size;
}

/**
 * Get the access config for a tool by name. Used by authorization middleware.
 */
export function getToolAccessConfig(
  toolName: string,
): MCPToolAccessConfig | undefined {
  const def = storedToolDefinitions.get(toolName);
  return def?.access;
}

export type AuditLoggerFn = (msg: string) => void;
export type AuthLoggerFn = (msg: string) => void;

let auditLogFn: AuditLoggerFn = () => {};
let authLogFn: AuthLoggerFn = () => {};

/**
 * Initialize the logger functions for security auditing.
 */
export function initSecurityLoggers(
  audit: AuditLoggerFn,
  auth: AuthLoggerFn,
): void {
  auditLogFn = audit;
  authLogFn = auth;
}

/**
 * Check if the caller with the given session ID has permission to invoke a tool.
 *
 * "Authenticated" is not a special role name — it means the user successfully
 * logged in (has any roles at all).  The MashroomSecurityService injects
 * "Authenticated" into every authenticated user's roles, but we also treat
 * a non-empty roles array as proof of authentication so the check works even
 * if the middleware only captured the user's explicit roles.
 */
export function checkToolAccess(
  sessionId: string | undefined,
  toolDef: StoredToolDefinition,
): { allowed: boolean; reason?: string } {
  const access = toolDef.access;

  if (!access || (access.roles === undefined && !access.type)) {
    return { allowed: true };
  }

  const roles = sessionRoles.get(sessionId ?? '') ?? [];
  const isAuthenticated = roles.length > 0;

  if (access.roles && access.roles.length > 0) {
    const hasRequiredRole = access.roles.some((role) => {
      // "Authenticated" is satisfied by any authenticated user (non-empty roles)
      if (role === 'Authenticated') return isAuthenticated;
      return roles.includes(role);
    });
    if (!hasRequiredRole) {
      authLogFn(
        `Access denied for tool "${toolDef.toolName}" on session "${sessionId}": ` +
          `required role ${JSON.stringify(access.roles)}, has ${JSON.stringify(roles)}`,
      );
      return {
        allowed: false,
        reason: `required role ${JSON.stringify(access.roles)}, has ${JSON.stringify(roles)}`,
      };
    }
  }

  if (access.type === 'write' && !isAuthenticated) {
    authLogFn(
      `Access denied for write tool "${toolDef.toolName}" on session "${sessionId}": not authenticated`,
    );
    return { allowed: false, reason: 'not authenticated' };
  }

  if (access.type === 'admin' && !roles.includes('Administrator')) {
    authLogFn(
      `Access denied for admin tool "${toolDef.toolName}" on session "${sessionId}": not an administrator`,
    );
    return { allowed: false, reason: 'not an administrator' };
  }

  return { allowed: true };
}

export function getRegisteredTools(): Map<string, ToolRegistration> {
  const result = new Map<string, ToolRegistration>();
  for (const [toolName, def] of storedToolDefinitions.entries()) {
    // Find the first registered tool instance across servers
    let toolInstance: RegisteredTool | undefined;
    for (const tools of serverTools.values()) {
      toolInstance = tools.get(toolName);
      if (toolInstance) break;
    }
    if (toolInstance) {
      result.set(toolName, {
        tool: toolInstance,
        sourcePluginName: def.pluginName,
        category: def.category,
      });
    }
  }
  return result;
}

/**
 * Active McpServer instances keyed by session ID.
 * Each session gets its own server so multiple transports can coexist.
 */
const activeServers: Map<string, McpServer> = new Map();

/**
 * Wrap a tool callback with authorization check and audit logging for a given session.
 */
function createAuthWrappedCallback(
  sessionId: string,
  toolName: string,
  toolDef: StoredToolDefinition,
  callback: (...args: any[]) => Promise<any>,
): (...args: any[]) => Promise<any> {
  return async (...args: any[]) => {
    touchSession(sessionId);
    const result = checkToolAccess(sessionId, toolDef);
    if (!result.allowed) {
      auditLogFn(
        `AUTH_DENIED: session=${sessionId}, tool=${toolName}, reason=${result.reason}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Access denied for tool "${toolName}": ${result.reason}`,
          },
        ],
        isError: true,
      };
    }

    const argKeys =
      args[0] && typeof args[0] === 'object' ? Object.keys(args[0]) : [];
    auditLogFn(
      `TOOL_CALL: session=${sessionId}, tool=${toolName}, argsKeys=[${argKeys.join(', ')}]`,
    );

    try {
      const res = await callback(...args);
      auditLogFn(`TOOL_OK: session=${sessionId}, tool=${toolName}`);
      return res;
    } catch (err) {
      auditLogFn(
        `TOOL_ERROR: session=${sessionId}, tool=${toolName}, error=${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  };
}

/**
 * Replay all stored tool definitions onto a newly created McpServer.
 */
function replayTools(server: McpServer, sessionId: string): void {
  const tools = new Map<string, RegisteredTool>();
  serverTools.set(sessionId, tools);

  for (const def of storedToolDefinitions.values()) {
    const enrichedConfig = enrichToolConfig(def.config, def.access);

    const wrappedCallback = createAuthWrappedCallback(
      sessionId,
      def.toolName,
      def,
      def.callback,
    );
    const registeredTool = server.registerTool(
      def.toolName,
      enrichedConfig as Parameters<McpServer['registerTool']>[1],
      wrappedCallback as Parameters<McpServer['registerTool']>[2],
    );
    tools.set(def.toolName, registeredTool);
  }
}

/**
 * Create a new McpServer instance for a given session.
 * All currently registered tools are automatically replayed onto it.
 */
function createMcpServerInstance(): McpServer {
  return new McpServer(SERVER_METADATA, { capabilities: SERVER_CAPABILITIES });
}

export function createServer(sessionId: string): McpServer {
  const server = createMcpServerInstance();
  activeServers.set(sessionId, server);
  replayTools(server, sessionId);
  return server;
}

/**
 * Remove and clean up an McpServer instance for a session.
 */
export function removeServer(sessionId: string): void {
  activeServers.delete(sessionId);
  serverTools.delete(sessionId);
}

/**
 * @deprecated Use createServer() instead for per-session servers.
 * Kept for backward compatibility with code that doesn't manage sessions.
 */
const getServer = (): McpServer => {
  const defaultSessionId = '__default__';
  if (!activeServers.has(defaultSessionId)) {
    activeServers.set(defaultSessionId, createMcpServerInstance());
    // Replay tools onto the default server too
    replayTools(activeServers.get(defaultSessionId)!, defaultSessionId);
  }

  return activeServers.get(defaultSessionId)!;
};

export default getServer;
