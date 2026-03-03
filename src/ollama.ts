import type { AgentHandler } from "./agent.js";
import type { ToneStore } from "./tone.js";
import type { OllamaToolManager, OllamaToolDef, OllamaToolCall } from "./ollama-tools.js";
import { DISCORD_BOT_PROMPT } from "./prompts.js";

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

/** Keywords that trigger automatic web_search pre-fetch before asking the model */
export const PRE_SEARCH_TRIGGERS = ['ニュース', '天気', '速報', 'news', 'weather'];

/** Returns true when the prompt is about news/weather and needs a pre-emptive web search */
export function shouldPreFetchWebSearch(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return PRE_SEARCH_TRIGGERS.some(kw => lower.includes(kw));
}

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

/** Ask the model to generate an optimal web search query from the user's prompt */
async function generateSearchQuery(prompt: string, apiUrl: string, model: string): Promise<string> {
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: "ユーザーのメッセージを元に、ウェブ検索に最適なクエリを1行で出力してください。クエリのみ出力し、説明は不要です。",
      },
      { role: "user", content: prompt },
    ],
    stream: false,
  };
  const response = await fetch(`${apiUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return prompt;
  const data = await response.json() as OllamaApiResponse;
  const query = (data.message.content ?? "").trim();
  return query || prompt;
}

export function createOllamaHandler(config: OllamaHandlerConfig): AgentHandler {
  const historyMap = new Map<string, OllamaMessage[]>();
  const generationMap = new Map<string, number>();

  return {
    async ask(prompt: string, channelId: string): Promise<string> {
      // Given: previous messages for this channel
      const history = historyMap.get(channelId) ?? [];
      const generation = generationMap.get(channelId) ?? 0;

      // System prompt: always include base Discord bot instructions + tone
      const tonePrompt = config.toneStore.getSystemPrompt();
      const systemContent = [DISCORD_BOT_PROMPT, tonePrompt].filter(Boolean).join("\n\n");
      const systemMessages: OllamaMessage[] = [{ role: "system", content: systemContent }];

      // Pre-emptive web search: auto-call web_search for news/weather queries
      // (needed for models that won't call the tool themselves)
      let userContent = prompt;
      if (config.toolManager && shouldPreFetchWebSearch(prompt)) {
        const searchQuery = await generateSearchQuery(prompt, config.apiUrl, config.model);
        const searchResult = await config.toolManager.executeTool('web_search', { query: searchQuery });
        if (searchResult && !searchResult.startsWith('Error:')) {
          userContent = `[ウェブ検索結果]\n${searchResult}\n\n[質問] ${prompt}\n\n回答には参照した記事のURLを「出典: URL」として必ず含めてください。`;
        }
      }

      const userMessage: OllamaMessage = { role: "user", content: userContent };
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
          // No tool calls — save history only if channel wasn't cleared while this request ran
          if ((generationMap.get(channelId) ?? 0) === generation) {
            historyMap.set(channelId, [...history, userMessage, assistantMessage]);
          }
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
      if ((generationMap.get(channelId) ?? 0) === generation) {
        historyMap.set(channelId, messages.slice(systemMessages.length));
      }
      return "（最大ツール実行回数に達しました）";
    },
    clearHistory(channelId: string): void {
      historyMap.delete(channelId);
      generationMap.set(channelId, (generationMap.get(channelId) ?? 0) + 1);
    },
  };
}
