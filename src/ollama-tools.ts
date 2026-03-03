import { readFile, writeFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

const execAsync = promisify(exec);

export type OllamaToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
  };
};

// Ollama tool call — supports both wrapper formats:
//   standard:  { function: { name, arguments } }
//   flat:      { name, arguments }  (some models like qwen3)
export type OllamaToolCall =
  | { function: { name: string; arguments: Record<string, unknown> } }
  | { name: string; arguments: Record<string, unknown> };

export function resolveToolCall(tc: OllamaToolCall): { name: string; arguments: Record<string, unknown> } {
  if ("function" in tc) return tc.function;
  return { name: tc.name, arguments: tc.arguments };
}

export type OllamaToolManagerConfig = {
  mcpServers: Record<string, McpServerConfig>;
  cwd: string;
};

export type OllamaToolManager = {
  getTools(): Promise<OllamaToolDef[]>;
  executeTool(name: string, args: Record<string, unknown>): Promise<string>;
  dispose(): Promise<void>;
};

// Bash security: check allowed prefixes (deny list checked first)
const ALLOWED_BASH_PREFIXES = [
  "npm run ",
  "npx tsc ",
  "npx vitest ",
  "node ",
  "tsx ",
  "git status",
  "git diff ",
  "git log ",
  "git add ",
  "git commit ",
  "git branch ",
  "git checkout ",
  "git stash ",
  "ls",
  "cat ",
  "head ",
  "tail ",
  "wc ",
  "find ",
  "grep ",
  "mkdir ",
  "cp ",
  "mv ",
];

const DENIED_BASH_PATTERNS = ["rm -rf", "git push", "curl ", "wget ", ".env"];

const BUILTIN_TOOLS: OllamaToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a file from the filesystem",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The absolute or relative file path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates or overwrites the file)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path to write to" },
          content: { type: "string", description: "The content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing an exact string with a new string",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path to edit" },
          old_string: { type: "string", description: "The exact string to replace" },
          new_string: { type: "string", description: "The replacement string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_bash",
      description: "Execute an allowed shell command",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob_files",
      description: "List files matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The glob pattern (e.g., **/*.ts)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_files",
      description: "Search for a regex pattern in files",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The regex pattern to search for" },
          path: {
            type: "string",
            description: "Directory or file to search in (optional, defaults to current directory)",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch content from a URL and return the text",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
];

function sanitizeServerName(name: string): string {
  return name.replace(/-/g, "_");
}

export function isBashAllowed(command: string): boolean {
  // Deny list checked first
  if (DENIED_BASH_PATTERNS.some((pattern) => command.includes(pattern))) {
    return false;
  }
  // Allow only commands matching an allowed prefix
  return ALLOWED_BASH_PREFIXES.some((prefix) => {
    if (prefix.endsWith(" ")) {
      return command.startsWith(prefix);
    }
    // No trailing space: match exact command or command followed by a space
    return command === prefix || command.startsWith(prefix + " ");
  });
}

export function createOllamaToolManager(config: OllamaToolManagerConfig): OllamaToolManager {
  const mcpClients = new Map<string, Client>();
  let initialized = false;
  let cachedTools: OllamaToolDef[] | null = null;

  async function initialize(): Promise<void> {
    if (initialized) return;
    initialized = true;

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
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
        mcpClients.set(serverName, client);
        console.error(`[ollama-tools] Connected to MCP server: ${serverName}`);
      } catch (err) {
        console.error(`[ollama-tools] Failed to connect to MCP server ${serverName}:`, err);
      }
    }
  }

  async function getMcpTools(): Promise<OllamaToolDef[]> {
    const tools: OllamaToolDef[] = [];
    for (const [serverName, client] of mcpClients) {
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

  return {
    async getTools(): Promise<OllamaToolDef[]> {
      if (cachedTools) return cachedTools;
      await initialize();
      const mcpTools = await getMcpTools();
      cachedTools = [...BUILTIN_TOOLS, ...mcpTools];
      return cachedTools;
    },

    async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
      try {
        switch (name) {
          case "read_file": {
            const path = args.path as string;
            if (/\.env/.test(path)) return "Error: Access to .env files is denied";
            return await readFile(path, "utf-8");
          }

          case "write_file": {
            const path = args.path as string;
            if (/\.env/.test(path)) return "Error: Access to .env files is denied";
            await writeFile(path, args.content as string, "utf-8");
            return `Successfully wrote to ${path}`;
          }

          case "edit_file": {
            const path = args.path as string;
            if (/\.env/.test(path)) return "Error: Access to .env files is denied";
            const original = await readFile(path, "utf-8");
            const oldString = args.old_string as string;
            if (!original.includes(oldString)) {
              return `Error: The string to replace was not found in ${path}`;
            }
            await writeFile(path, original.replace(oldString, args.new_string as string), "utf-8");
            return `Successfully edited ${path}`;
          }

          case "run_bash": {
            const command = args.command as string;
            if (!isBashAllowed(command)) {
              return `Error: Command not allowed: ${command}`;
            }
            const { stdout, stderr } = await execAsync(command, { cwd: config.cwd });
            return stdout + (stderr ? `\nstderr: ${stderr}` : "");
          }

          case "glob_files": {
            const results = await glob(args.pattern as string, { cwd: config.cwd });
            return results.join("\n") || "No files found";
          }

          case "grep_files": {
            const searchPath = (args.path as string | undefined) ?? ".";
            const escapedPattern = (args.pattern as string).replace(/"/g, '\\"');
            const escapedPath = searchPath.replace(/"/g, '\\"');
            const { stdout } = await execAsync(
              `grep -rn "${escapedPattern}" "${escapedPath}"`,
              { cwd: config.cwd },
            );
            return stdout || "No matches found";
          }

          case "web_fetch": {
            const response = await fetch(args.url as string);
            return await response.text();
          }

          default: {
            if (!name.startsWith("mcp__")) {
              return `Error: Unknown tool: ${name}`;
            }

            const parts = name.split("__");
            if (parts.length < 3) return `Error: Invalid MCP tool name: ${name}`;

            const sanitizedServerName = parts[1];
            // Tool name may contain __ itself
            const toolName = parts.slice(2).join("__");

            const serverName = Object.keys(config.mcpServers).find(
              (s) => sanitizeServerName(s) === sanitizedServerName,
            );
            if (!serverName) return `Error: MCP server not found: ${sanitizedServerName}`;

            const client = mcpClients.get(serverName);
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
        }
      } catch (err) {
        return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
      }
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
