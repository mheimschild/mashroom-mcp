import type {
  CompiledStateGraph,
  StateDefinitionInit,
} from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Ollama } from '@langchain/ollama';
import type { MashroomLogger } from '@mashroom/mashroom/type-definitions';
import type { Request, Response, Router } from 'express';

type AgentType = CompiledStateGraph<
  unknown,
  unknown,
  string,
  StateDefinitionInit,
  StateDefinitionInit,
  StateDefinitionInit
>;

export interface ChatPluginConfig {
  model?: string;
  ollamaBaseUrl?: string;
  mcpUrl?: string;
}

const DEFAULT_CONFIG: Required<ChatPluginConfig> = {
  model: 'granite4:latest',
  ollamaBaseUrl: 'http://localhost:11434',
  mcpUrl: 'http://localhost:5051/mcp',
};

let agent: AgentType | null = null;
let config: Required<ChatPluginConfig> = DEFAULT_CONFIG;

export const setConfig = (pluginConfig: ChatPluginConfig): void => {
  config = {
    model: pluginConfig.model ?? DEFAULT_CONFIG.model,
    ollamaBaseUrl: pluginConfig.ollamaBaseUrl ?? DEFAULT_CONFIG.ollamaBaseUrl,
    mcpUrl: pluginConfig.mcpUrl ?? DEFAULT_CONFIG.mcpUrl,
  };
};

/**
 * POST /chat handler — streams LLM responses via SSE.
 *
 * Agent pipeline:
 * - Model: Ollama (configurable) via @langchain/ollama
 * - Tools: fetched from MCP server (configurable) via MultiServerMCPClient
 * - Streaming: uses agent.stream() with streamMode: "messages", filters out tool-node metadata
 */

const initRouter = (router: Router, logger: MashroomLogger): void => {
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { message } = req.body as { message?: string };
      if (!message) {
        res.status(400).json({ error: 'Missing "message" in request body' });
        return;
      }

      // Lazily initialize the agent on first request
      if (!agent) {
        agent = await createAgent(logger);
      }

      // Set up SSE response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Stream the agent response
      const stream = await agent.stream(
        { messages: [{ role: 'user', content: message }] },
        { streamMode: 'messages' },
      );

      for await (const chunk of stream) {
        // Filter out tool-node metadata — only send actual content
        for (const item of Array.isArray(chunk) ? chunk : [chunk]) {
          const content = (item as { content?: unknown })?.content;
          if (content && typeof content === 'string') {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      logger.error(`Chat error: ${err}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.write(
          `data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`,
        );
        res.end();
      }
    }
  });
};

async function createAgent(logger: MashroomLogger): Promise<AgentType> {
  const model = new Ollama({
    model: config.model,
    baseUrl: config.ollamaBaseUrl,
  });

  const mcpClient = new MultiServerMCPClient({
    portalTools: {
      url: config.mcpUrl,
    },
  });

  await mcpClient.initializeConnections();

  const tools = await mcpClient.getTools();

  logger.info(`Chat agent initialized with ${tools.length} MCP tools`);

  return createReactAgent({
    llm: model,
    tools,
  });
}

export default initRouter;
