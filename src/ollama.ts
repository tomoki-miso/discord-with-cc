import type { AgentHandler } from "./agent.js";
import type { ToneStore } from "./tone.js";

type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaApiResponse = {
  message: OllamaMessage;
  done: boolean;
};

export type OllamaHandlerConfig = {
  apiUrl: string;
  model: string;
  toneStore: ToneStore;
};

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
      const messages = [...systemMessages, ...history, userMessage];

      const response = await fetch(`${config.apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, messages, stream: false }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as OllamaApiResponse;
      const assistantMessage = data.message;

      // Update history: store user + assistant messages (without system message)
      historyMap.set(channelId, [...history, userMessage, assistantMessage]);

      return assistantMessage.content;
    },
  };
}
