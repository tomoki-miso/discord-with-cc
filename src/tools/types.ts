export type OllamaToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
  };
};

// Ollama returns tool calls in one of two formats:
//   nested (OpenAI-compat): { function: { name, arguments } }
//   flat (qwen3 etc.):      { name, arguments }
export type OllamaToolCall =
  | { function: { name: string; arguments: Record<string, unknown> } }
  | { name: string; arguments: Record<string, unknown> };

export type OllamaToolManagerConfig = {
  mcpServers: Record<string, import("@anthropic-ai/claude-agent-sdk").McpServerConfig>;
  cwd: string;
};

export type OllamaToolManager = {
  getTools(): Promise<OllamaToolDef[]>;
  executeTool(name: string, args: Record<string, unknown>): Promise<string>;
  dispose(): Promise<void>;
};
