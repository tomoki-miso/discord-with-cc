import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { OllamaToolDef } from "../types.js";

export function sanitizeServerName(name: string): string {
  return name.replace(/-/g, "_");
}

export async function connectMcpClients(
  mcpServers: Record<string, McpServerConfig>,
): Promise<Map<string, Client>> {
  const clients = new Map<string, Client>();

  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    try {
      const client = new Client({ name: "ollama-tool-manager", version: "1.0.0" });

      let transport;
      if (serverConfig.type === "stdio") {
        transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args ?? [],
          env: { ...process.env } as Record<string, string>,
        });
      } else if (serverConfig.type === "http") {
        const headers: Record<string, string> = {};
        const token = process.env.SLACK_MCP_TOKEN ?? process.env.SLACK_BOT_TOKEN;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
          requestInit: { headers },
        });
      } else {
        console.error(`[ollama-tools] Unknown server type for ${serverName}, skipping`);
        continue;
      }

      await client.connect(transport);
      clients.set(serverName, client);
      console.error(`[ollama-tools] Connected to MCP server: ${serverName}`);
    } catch (err) {
      console.error(`[ollama-tools] Failed to connect to MCP server ${serverName}:`, err);
    }
  }

  return clients;
}

export async function listMcpTools(
  clients: Map<string, Client>,
): Promise<OllamaToolDef[]> {
  const tools: OllamaToolDef[] = [];
  for (const [serverName, client] of clients) {
    try {
      const result = await client.listTools();
      const sanitizedName = sanitizeServerName(serverName);
      for (const tool of result.tools) {
        tools.push({
          type: "function",
          function: {
            name: `mcp__${sanitizedName}__${tool.name}`,
            description: tool.description ?? `Tool ${tool.name} from ${serverName}`,
            parameters: tool.inputSchema as OllamaToolDef["function"]["parameters"],
          },
        });
      }
    } catch (err) {
      console.error(`[ollama-tools] Failed to list tools from ${serverName}:`, err);
    }
  }
  return tools;
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  clients: Map<string, Client>,
  mcpServers: Record<string, McpServerConfig>,
): Promise<string | null> {
  if (!name.startsWith("mcp__")) return null;

  const parts = name.split("__");
  if (parts.length < 3) return `Error: Invalid MCP tool name: ${name}`;

  const sanitizedServerName = parts[1];
  // Tool name may contain __ itself
  const toolName = parts.slice(2).join("__");

  const serverName = Object.keys(mcpServers).find(
    (s) => sanitizeServerName(s) === sanitizedServerName,
  );
  if (!serverName) return `Error: MCP server not found: ${sanitizedServerName}`;

  const client = clients.get(serverName);
  if (!client) return `Error: MCP client not connected: ${serverName}`;

  // Strip null/undefined values — Ollama sometimes passes null for optional params
  const cleanArgs = Object.fromEntries(
    Object.entries(args).filter(([, v]) => v != null),
  );
  const result = await client.callTool({ name: toolName, arguments: cleanArgs });
  const content = result.content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "object" && item !== null && "text" in item) {
          return item.text as string;
        }
        return JSON.stringify(item);
      })
      .join("\n");
  }
  return JSON.stringify(content);
}
