import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOllamaHandler } from "../ollama.js";

// グローバルfetchをモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createMockToneStore(systemPrompt = "") {
  return {
    get: vi.fn(),
    set: vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue(systemPrompt),
    listPresets: vi.fn().mockReturnValue(["default"]),
  };
}

function createSuccessResponse(content: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      message: { role: "assistant", content },
      done: true,
    }),
    text: vi.fn(),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("createOllamaHandler", () => {
  describe("ask", () => {
    it("returns the assistant message content from the response", async () => {
      // Given: a handler with no system prompt and a successful API response
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce(createSuccessResponse("Hello from Ollama!"));

      // When: asking a question
      const result = await handler.ask("Hello", "ch1");

      // Then: returns the assistant's content
      expect(result).toBe("Hello from Ollama!");
    });

    it("accumulates history across multiple requests for the same channel", async () => {
      // Given: a handler with no history yet
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch
        .mockResolvedValueOnce(createSuccessResponse("First response"))
        .mockResolvedValueOnce(createSuccessResponse("Second response"));

      // When: asking two questions in the same channel
      await handler.ask("First question", "ch1");
      await handler.ask("Second question", "ch1");

      // Then: the second request includes the first exchange in the messages array
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      const messages: Array<{ role: string; content: string }> = secondCallBody.messages;
      expect(messages).toContainEqual({ role: "user", content: "First question" });
      expect(messages).toContainEqual({ role: "assistant", content: "First response" });
      expect(messages).toContainEqual({ role: "user", content: "Second question" });
    });

    it("maintains independent history for different channels", async () => {
      // Given: a handler with no history
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch
        .mockResolvedValueOnce(createSuccessResponse("Channel A response"))
        .mockResolvedValueOnce(createSuccessResponse("Channel B response"));

      // When: asking in two different channels
      await handler.ask("Question in A", "ch-a");
      await handler.ask("Question in B", "ch-b");

      // Then: channel B's request does not include channel A's messages
      const channelBBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      const messages: Array<{ role: string; content: string }> = channelBBody.messages;
      expect(messages).not.toContainEqual({ role: "user", content: "Question in A" });
      expect(messages).toContainEqual({ role: "user", content: "Question in B" });
    });

    it("does not include a system message when systemPrompt is empty", async () => {
      // Given: a tone store returning an empty system prompt
      const toneStore = createMockToneStore("");
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce(createSuccessResponse("response"));

      // When: asking a question
      await handler.ask("Hello", "ch1");

      // Then: no system message is included in the request
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const messages: Array<{ role: string }> = body.messages;
      expect(messages.some((m) => m.role === "system")).toBe(false);
    });

    it("prepends a system message when systemPrompt is set, but does not store it in history", async () => {
      // Given: a tone store returning a system prompt
      const toneStore = createMockToneStore("You are a helpful assistant.");
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch
        .mockResolvedValueOnce(createSuccessResponse("First response"))
        .mockResolvedValueOnce(createSuccessResponse("Second response"));

      // When: asking two questions
      await handler.ask("First", "ch1");
      await handler.ask("Second", "ch1");

      // Then: first request has system message prepended
      const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(firstBody.messages[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant.",
      });

      // And: second request also has system message prepended (not duplicated from history)
      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      const systemMessages = secondBody.messages.filter(
        (m: { role: string }) => m.role === "system",
      );
      expect(systemMessages).toHaveLength(1);
    });

    it("throws an error when the API returns a non-OK status", async () => {
      // Given: a handler and an API that returns an error
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      });

      // When/Then: asking throws an error with status info
      await expect(handler.ask("Hello", "ch1")).rejects.toThrow(
        "Ollama API error 500: Internal Server Error",
      );
    });
  });
});
