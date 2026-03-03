import type { AgentHandler } from "./agent.js";
import type { ToneStore } from "./tone.js";
import type { OllamaToolManager, OllamaToolDef, OllamaToolCall } from "./ollama-tools.js";
import { resolveToolCall } from "./ollama-tools.js";

type OllamaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: OllamaToolCall[] }
  | { role: "tool"; content: string };

type OllamaApiResponse = {
  message: OllamaMessage;
  done: boolean;
};

export type OllamaHandlerConfig = {
  apiUrl: string;
  model: string;
  toneStore: ToneStore;
  toolManager?: OllamaToolManager;
};

const MAX_TOOL_ITERATIONS = 10;

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
          stream: false,
        };
        if (tools.length > 0) {
          body.tools = tools;
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

        const data = (await response.json()) as OllamaApiResponse;
        const assistantMessage = data.message as Extract<OllamaMessage, { role: "assistant" }>;

        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          // No tool calls — save history and return the text response
          historyMap.set(channelId, [...history, userMessage, assistantMessage]);
          return assistantMessage.content;
        }

        // Execute all tool calls in parallel (handle both { function: {...} } and { name, arguments } formats)
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
