import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { config as appConfig } from "./config.js";
import { FILE_TOOL_DEFS, executeFileTool } from "./tools/builtin/file.js";
import { BASH_TOOL_DEF, executeBashTool } from "./tools/builtin/bash.js";
import { SEARCH_TOOL_DEFS, executeSearchTool } from "./tools/builtin/search.js";
import { WEB_TOOL_DEFS, executeWebTool } from "./tools/builtin/web.js";
import { connectMcpClients, listMcpTools, executeMcpTool } from "./tools/mcp/client.js";
import { ToolRegistry } from "./tools/registry.js";

export type { OllamaToolDef, OllamaToolCall, OllamaToolManager, OllamaToolManagerConfig } from "./tools/types.js";
export { isBashAllowed, ALLOWED_BASH_PREFIXES, DENIED_BASH_PATTERNS } from "./tools/security.js";
export { ToolRegistry } from "./tools/registry.js";

import type { OllamaToolDef, OllamaToolManager, OllamaToolManagerConfig } from "./tools/types.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export function createOllamaToolManager(config: OllamaToolManagerConfig): OllamaToolManager {
  const registry = new ToolRegistry();
  const mcpClients = new Map<string, Client>();
  let initialized = false;
  let cachedDefinitions: OllamaToolDef[] | null = null;

  async function initialize(): Promise<void> {
    if (initialized) return;
    initialized = true;

    // Register builtin tools
    registry.registerAll(FILE_TOOL_DEFS, (name, args) => executeFileTool(name, args));
    registry.register(BASH_TOOL_DEF, (args) => executeBashTool("run_bash", args, config.cwd).then(r => r ?? ""));
    registry.registerAll(SEARCH_TOOL_DEFS, (name, args) => executeSearchTool(name, args, config.cwd));
    registry.registerAll(WEB_TOOL_DEFS, (name, args) => executeWebTool(name, args, appConfig.tavily.apiKey));

    // Connect to MCP servers and register their tools
    const clients = await connectMcpClients(config.mcpServers);
    for (const [k, v] of clients) {
      mcpClients.set(k, v);
    }

    const mcpToolDefs = await listMcpTools(mcpClients);
    for (const def of mcpToolDefs) {
      const toolDef = def;
      registry.register(toolDef, (args) =>
        executeMcpTool(toolDef.function.name, args, mcpClients, config.mcpServers).then(
          r => r ?? `Error: Unknown MCP tool: ${toolDef.function.name}`,
        ),
      );
    }
  }

  return {
    async getTools(): Promise<OllamaToolDef[]> {
      await initialize();
      if (!cachedDefinitions) {
        cachedDefinitions = registry.getDefinitions();
      }
      return cachedDefinitions;
    },

    async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
      await initialize();
      // If not in registry but looks like an MCP tool, delegate to executeMcpTool
      // (handles the "client not connected" case when initialization failed)
      if (!registry.has(name) && name.startsWith("mcp__")) {
        const result = await executeMcpTool(name, args, mcpClients, config.mcpServers);
        return result ?? `Error: Unknown MCP tool: ${name}`;
      }
      return registry.execute(name, args);
    },

    async dispose(): Promise<void> {
      for (const [serverName, client] of mcpClients) {
        try {
          await client.close();
        } catch (err) {
          console.error(`[ollama-tools] Failed to close MCP client ${serverName}:`, err);
        }
      }
      mcpClients.clear();
    },
  };
}
