import type { MashroomLogger } from '@mashroom/mashroom/type-definitions';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from 'express';
import { json } from 'express';
import {
  clearSessionRoles,
  createServer,
  removeServer,
  setSessionRoles,
  touchSession,
} from './MCPServer';

/**
 * In-memory store mapping session IDs to their active transport instances.
 */
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

/* ---------- Rate limiting (per-IP) ---------- */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Default: 120 requests per minute per IP
let rateLimitMaxRequests = 120;
let rateLimitWindowMs = 60 * 1000;

export function setRateLimitConfig(
  maxRequests: number,
  windowMs: number,
): void {
  rateLimitMaxRequests = maxRequests;
  rateLimitWindowMs = windowMs;
}

function getRateLimitKey(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string) ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

const rateLimitMiddleware: RequestHandler = (_req, res, next) => {
  const key = getRateLimitKey(_req);
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > rateLimitWindowMs) {
    entry = { count: 0, windowStart: now };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  res.setHeader('X-RateLimit-Limit', String(rateLimitMaxRequests));
  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, rateLimitMaxRequests - entry.count)),
  );

  if (entry.count > rateLimitMaxRequests) {
    res.status(429).json({
      jsonrpc: '2.0' as const,
      error: {
        code: -32000,
        message: 'Rate limit exceeded. Try again later.',
      },
      id: null,
    });
    return;
  }

  next();
};

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > rateLimitWindowMs) {
      rateLimitStore.delete(key);
    }
  }
}, rateLimitWindowMs);

/* ---------- CORS middleware ---------- */

let allowedOrigins: string[] = [];

export function setAllowedOrigins(origins: string[]): void {
  allowedOrigins = origins;
}

const corsMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.length > 0) {
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } else if (allowedOrigins.length === 0) {
    // If no origins configured, allow same-origin only (no header set)
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Mcp-Session-Id, Authorization, Cookie',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }

  next();
};

/* ---------- Security context extraction ---------- */

const securityContextMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  // Extract user roles from Mashroom's security service.
  // We need to do this on every request so that:
  //   1. The initialize POST (no session ID yet) can still capture the user
  //      and apply roles once the session is created.
  //   2. Subsequent requests refresh roles for the active session.
  const mashroomCtx = (req as unknown as Record<string, unknown>)
    .pluginContext as Record<string, unknown> | undefined;
  if (!mashroomCtx) {
    next();
    return;
  }

  const services = mashroomCtx['services'] as
    | Record<string, unknown>
    | undefined;
  if (!services) {
    next();
    return;
  }

  const securityService = services['security'] as
    | Record<string, unknown>
    | undefined;
  if (!securityService || !securityService['service']) {
    next();
    return;
  }

  // Use the security service to get the authenticated user.
  // The MashroomSecurityService automatically injects "Authenticated" into roles
  // for any successfully authenticated user, so we don't need a literal "Authenticated" role
  // in users.json — any non-empty roles array means the user is authenticated.
  const secSvc = securityService.service as {
    getUser: (
      req: Request,
    ) => { username?: string; roles?: string[] } | undefined;
    isAuthenticated: (req: Request) => boolean;
  };

  const user = secSvc.getUser(req);
  if (!user || !user.roles || user.roles.length === 0) {
    next();
    return;
  }

  // If there is an active MCP session, attach roles to it.
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId) {
    setSessionRoles(sessionId, user.roles);
  } else {
    // No session yet — store roles under a special key so the onsessioninitialized
    // callback can pick them up when the new session is created.
    pendingInitRoles.set(user.username ?? '__anonymous__', user.roles);
  }

  next();
};

/**
 * Roles captured during the initialize POST (before the MCP session ID exists).
 * Keyed by username so they can be applied when onsessioninitialized fires.
 */
const pendingInitRoles: Map<string, string[]> = new Map();

/**
 * Build and attach the MCP Streamable HTTP route handlers to an Express router.
 *
 * Follows the pattern documented at:
 * https://docs.langchain.com/oss/javascript/langchain/mcp#transports
 *
 * The `StreamableHTTPServerTransport` class handles the full request lifecycle
 * (session validation, SSE streaming, JSON-RPC dispatch) via a single
 * `handleRequest(req, res, parsedBody)` call — no manual method routing needed.
 */
const initRouter = (router: Router, logger: MashroomLogger): void => {
  // Security middleware stack: CORS -> Rate Limit -> Security Context
  router.use('/', corsMiddleware);
  router.use('/', rateLimitMiddleware);
  router.use('/', securityContextMiddleware);

  // Shared handler for all three HTTP methods (GET / POST / DELETE).
  // The transport internally dispatches based on request method.
  const mcpHandler: RequestHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Touch session activity on any request
    if (sessionId) {
      touchSession(sessionId);
    }

    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport for an active session.
      transport = transports.get(sessionId);
    } else if (!sessionId && req.method === 'POST') {
      // New session — create a fresh transport and connect a dedicated MCP server.
      // Use a placeholder sessionId for server creation; the real one is generated
      // during the initialize handshake and updated in onsessioninitialized.
      const placeholderId = crypto.randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => {
          logger.info(`MCP session ${sid} initialized`);
          transports.set(sid, transport!);
          touchSession(sid);

          // Apply roles captured during the initialize POST.
          // securityContextMiddleware ran before we had a session ID, so it stored
          // roles keyed by username. Now that we have a real session, apply them.
          for (const [username, roles] of pendingInitRoles.entries()) {
            logger.debug(
              `Applying roles ${JSON.stringify(roles)} to new session ${sid} for user ${username}`,
            );
            setSessionRoles(sid, roles);
            // Also set on placeholderId so the already-connected McpServer's
            // tool callbacks (bound to placeholderId) can resolve roles.
            setSessionRoles(placeholderId, roles);
          }
          pendingInitRoles.clear();
        },
        onsessionclosed: (sid) => {
          logger.info(`MCP session ${sid} closed`);
          transports.delete(sid);
          clearSessionRoles(sid);
          removeServer(sid);
        },
      });

      // Create a per-session McpServer so multiple transports can coexist.
      const server = createServer(placeholderId);
      await server.connect(transport!);

      // Wire up cleanup when the transport itself closes (e.g. client disconnect).
      const t = transport;
      t.onclose = () => {
        const sid = t.sessionId;
        if (sid) {
          logger.debug(
            `Transport closed for session ${sid} — removing from store`,
          );
          transports.delete(sid);
          clearSessionRoles(sid);
          removeServer(sid);
        }
      };
    }

    // If no transport is available, the request cannot be handled.
    if (!transport) {
      const message =
        req.method === 'POST'
          ? 'Bad Request: POST without a session ID must be an initialize request'
          : `Bad Request: No valid session ID "${sessionId}" for ${req.method}`;

      logger.warn(message);
      res.status(400).json({
        jsonrpc: '2.0' as const,
        error: {
          code: -32000,
          message,
        },
        id: null,
      });
      return;
    }

    // Delegate to the transport — it handles GET (SSE), POST (JSON-RPC), and DELETE.
    await transport.handleRequest(req, res, req.body);
  };

  /**
   * GET /mcp — SSE subscription for server-to-client notifications.
   * The transport streams events (logging, progress, tool results) to the client.
   */
  router.get('/', mcpHandler);

  /**
   * POST /mcp — Initialize a new MCP session or dispatch JSON-RPC calls.
   * Body is parsed with a generous limit to support large tool arguments.
   */
  router.post('/', json({ limit: '10mb' }), mcpHandler);

  /**
   * DELETE /mcp — Explicitly terminate an MCP session.
   * The transport cleans up SSE connections and fires `onsessionclosed`.
   */
  router.delete('/', mcpHandler);
};

export default initRouter;
