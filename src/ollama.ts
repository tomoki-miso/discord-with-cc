import type { AgentHandler } from "./agent.js";
import type { ToneStore } from "./tone.js";
import type { OllamaToolManager, OllamaToolDef, OllamaToolCall } from "./ollama-tools.js";

type OllamaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: OllamaToolCall[] }
  | { role: "tool"; content: string };

type OllamaApiResponse = {
  message: OllamaMessage;
  done: boolean;
};

export type OllamaModelOptions = {
  num_ctx?: number;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
};

export type OllamaHandlerConfig = {
  apiUrl: string;
  model: string;
  toneStore: ToneStore;
  toolManager?: OllamaToolManager;
  options?: OllamaModelOptions;
};

const MAX_TOOL_ITERATIONS = 10;

/** Normalize tool call to { name, arguments } regardless of nested or flat format */
function resolveToolCall(tc: OllamaToolCall): { name: string; arguments: Record<string, unknown> } {
  if ("function" in tc) {
    return { name: tc.function.name, arguments: tc.function.arguments };
  }
  return { name: tc.name, arguments: tc.arguments };
}

async function readStreamingResponse(response: Response): Promise<{
  content: string;
  tool_calls?: OllamaToolCall[];
}> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let tool_calls: OllamaToolCall[] | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const chunk = JSON.parse(trimmed) as OllamaApiResponse;
      if (chunk.message.content) {
        content += chunk.message.content;
      }
      const msg = chunk.message as Extract<OllamaMessage, { role: "assistant" }>;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        tool_calls = msg.tool_calls;
      }
    }
  }

  return { content, tool_calls };
}

export function createOllamaHandler(config: OllamaHandlerConfig): AgentHandler {
  const historyMap = new Map<string, OllamaMessage[]>();

  return {
    async ask(prompt: string, channelId: string): Promise<string> {
      // Given: previous messages for this channel
      const history = historyMap.get(channelId) ?? [];

      // System prompt from tone store (prepended per request, not stored in history)
      const systemPrompt = config.toneStore.getSystemPrompt();
      const systemMessages: OllamaMessage[] = systemPrompt
        ? [{ role: "system", content: systemPrompt }]
        : [];

      const userMessage: OllamaMessage = { role: "user", content: prompt };
      let messages: OllamaMessage[] = [...systemMessages, ...history, userMessage];

      const tools: OllamaToolDef[] = config.toolManager
        ? await config.toolManager.getTools()
        : [];

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const body: Record<string, unknown> = {
          model: config.model,
          messages,
          stream: true,
        };
        if (tools.length > 0) {
          body.tools = tools;
        }
        if (config.options && Object.keys(config.options).length > 0) {
          body.options = config.options;
        }

        const response = await fetch(`${config.apiUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error ${response.status}: ${errorText}`);
        }

        const { content, tool_calls } = await readStreamingResponse(response);
        const assistantMessage: Extract<OllamaMessage, { role: "assistant" }> = {
          role: "assistant",
          content,
          ...(tool_calls ? { tool_calls } : {}),
        };

        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          // No tool calls — save history and return the text response
          historyMap.set(channelId, [...history, userMessage, assistantMessage]);
          return assistantMessage.content;
        }

        // Execute all tool calls in parallel (handles both nested and flat formats)
        const toolResults = await Promise.all(
          assistantMessage.tool_calls.map((tc) => {
            const { name, arguments: args } = resolveToolCall(tc);
            return config.toolManager!.executeTool(name, args);
          }),
        );

        // Append assistant message and tool results, then loop
        const toolMessages: OllamaMessage[] = toolResults.map((r) => ({
          role: "tool" as const,
          content: r,
        }));
        messages = [...messages, assistantMessage, ...toolMessages];
      }

      // Maximum iterations reached — save accumulated messages (excluding system prompt)
      historyMap.set(channelId, messages.slice(systemMessages.length));
      return "（最大ツール実行回数に達しました）";
    },
  };
}
