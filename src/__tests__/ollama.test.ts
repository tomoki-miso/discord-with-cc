import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOllamaHandler } from "../ollama.js";
import type { OllamaToolDef, OllamaToolManager } from "../ollama-tools.js";

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

function createStreamingSuccessResponse(content: string) {
  const chunks = [
    JSON.stringify({ message: { role: "assistant", content: content.slice(0, Math.ceil(content.length / 2)) }, done: false }),
    JSON.stringify({ message: { role: "assistant", content: content.slice(Math.ceil(content.length / 2)) }, done: false }),
    JSON.stringify({ message: { role: "assistant", content: "" }, done: true }),
  ].join("\n");
  const encoder = new TextEncoder();
  const encoded = encoder.encode(chunks);
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
    text: vi.fn(),
  };
}

function createStreamingToolCallResponse(
  toolName: string,
  toolArgs: Record<string, unknown> = {},
  flat = false,
) {
  const toolCall = flat
    ? { name: toolName, arguments: toolArgs }
    : { function: { name: toolName, arguments: toolArgs } };
  const chunks = [
    JSON.stringify({
      message: { role: "assistant", content: "", tool_calls: [toolCall] },
      done: false,
    }),
    JSON.stringify({ message: { role: "assistant", content: "" }, done: true }),
  ].join("\n");
  const encoder = new TextEncoder();
  const encoded = encoder.encode(chunks);
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
    text: vi.fn(),
  };
}

function createMockToolManager(tools: OllamaToolDef[] = []): OllamaToolManager {
  return {
    getTools: vi.fn().mockResolvedValue(tools),
    executeTool: vi.fn().mockResolvedValue("tool result"),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

const SAMPLE_TOOL: OllamaToolDef = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read a file",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
};

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
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("Hello from Ollama!"));

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
        .mockResolvedValueOnce(createStreamingSuccessResponse("First response"))
        .mockResolvedValueOnce(createStreamingSuccessResponse("Second response"));

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
        .mockResolvedValueOnce(createStreamingSuccessResponse("Channel A response"))
        .mockResolvedValueOnce(createStreamingSuccessResponse("Channel B response"));

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
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("response"));

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
        .mockResolvedValueOnce(createStreamingSuccessResponse("First response"))
        .mockResolvedValueOnce(createStreamingSuccessResponse("Second response"));

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

    // ---- Agentic loop tests ----
    it("includes tools in the request body when toolManager is provided", async () => {
      // Given: handler with a toolManager that has one tool
      const toolManager = createMockToolManager([SAMPLE_TOOL]);
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
        toolManager,
      });
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("done"));

      // When
      await handler.ask("Read a file", "ch1");

      // Then: the request body contains the tools array
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].function.name).toBe("read_file");
    });

    it("does not include tools in the request body when toolManager is absent", async () => {
      // Given: handler without toolManager
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("done"));

      // When
      await handler.ask("Hello", "ch1");

      // Then: tools key is absent from the request body
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools).toBeUndefined();
    });

    it("calls executeTool when the response contains tool_calls", async () => {
      // Given: first response has tool_calls, second is a final text response
      const toolManager = createMockToolManager([SAMPLE_TOOL]);
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
        toolManager,
      });
      mockFetch
        .mockResolvedValueOnce(createStreamingToolCallResponse("read_file", { path: "src/foo.ts" }))
        .mockResolvedValueOnce(createStreamingSuccessResponse("Here is the content"));

      // When
      const result = await handler.ask("Read src/foo.ts", "ch1");

      // Then: executeTool was called with the tool name and arguments
      expect(toolManager.executeTool).toHaveBeenCalledWith("read_file", { path: "src/foo.ts" });
      // And: the final text response is returned
      expect(result).toBe("Here is the content");
    });

    it("sends tool results back in the second fetch call", async () => {
      // Given: first fetch returns a tool call, second fetch returns final text
      const toolManager = createMockToolManager([SAMPLE_TOOL]);
      vi.mocked(toolManager.executeTool).mockResolvedValue("file content here");
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
        toolManager,
      });
      mockFetch
        .mockResolvedValueOnce(createStreamingToolCallResponse("read_file", { path: "foo.ts" }))
        .mockResolvedValueOnce(createStreamingSuccessResponse("The file says: file content here"));

      // When
      await handler.ask("Read foo.ts", "ch1");

      // Then: the second fetch includes a tool message with the tool result
      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
      const messages: Array<{ role: string; content: string }> = secondBody.messages;
      const toolMsg = messages.find((m) => m.role === "tool");
      expect(toolMsg).toBeDefined();
      expect(toolMsg?.content).toBe("file content here");
    });

    it("returns the max-iterations message when tool calls repeat 10 times", async () => {
      // Given: every response has tool_calls (loop never terminates naturally)
      const toolManager = createMockToolManager([SAMPLE_TOOL]);
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
        toolManager,
      });
      // Always return a new tool call response (ReadableStream can only be read once)
      mockFetch.mockImplementation(() => Promise.resolve(createStreamingToolCallResponse("read_file", { path: "a.ts" })));

      // When
      const result = await handler.ask("Keep looping", "ch1");

      // Then: exactly 10 fetch calls were made and the max-iterations message is returned
      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(result).toContain("最大ツール実行回数");
    });

    it("includes options in the request body when options are provided", async () => {
      // Given: a handler with model options configured
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
        options: { temperature: 0.5, num_ctx: 2048, top_p: 0.9, num_predict: 512 },
      });
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("response"));

      // When
      await handler.ask("Hello", "ch1");

      // Then: options are passed in the request body
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.options).toEqual({ temperature: 0.5, num_ctx: 2048, top_p: 0.9, num_predict: 512 });
    });

    it("omits options from the request body when no options are provided", async () => {
      // Given: a handler with no options
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "llama3.2",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("response"));

      // When
      await handler.ask("Hello", "ch1");

      // Then: options key is absent from the request body
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.options).toBeUndefined();
    });
  });

  describe("streaming responses", () => {
    it("aggregates streamed text chunks into a single response", async () => {
      // Given: a streaming response with two content chunks
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("Hello World"));

      // When
      const result = await handler.ask("Hi", "ch1");

      // Then: full text is returned
      expect(result).toBe("Hello World");
    });

    it("sends stream: true in the request body", async () => {
      // Given
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
      });
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("ok"));

      // When
      await handler.ask("test", "ch1");

      // Then: stream is true
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.stream).toBe(true);
    });

    it("handles tool calls in streamed response", async () => {
      // Given
      const toolManager = createMockToolManager([SAMPLE_TOOL]);
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen2.5:7b",
        toneStore,
        toolManager,
      });
      mockFetch
        .mockResolvedValueOnce(createStreamingToolCallResponse("read_file", { path: "foo.ts" }))
        .mockResolvedValueOnce(createStreamingSuccessResponse("file content"));

      // When
      const result = await handler.ask("Read foo.ts", "ch1");

      // Then
      expect(toolManager.executeTool).toHaveBeenCalledWith("read_file", { path: "foo.ts" });
      expect(result).toBe("file content");
    });

    it("handles flat tool_call format { name, arguments } without function wrapper (qwen3 etc.)", async () => {
      // Given: response uses flat format instead of { function: { name, arguments } }
      const toolManager = createMockToolManager([SAMPLE_TOOL]);
      const toneStore = createMockToneStore();
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "qwen3.5:9b",
        toneStore,
        toolManager,
      });
      mockFetch
        .mockResolvedValueOnce(createStreamingToolCallResponse("read_file", { path: "foo.ts" }, true))
        .mockResolvedValueOnce(createStreamingSuccessResponse("file content"));

      // When
      const result = await handler.ask("Read foo.ts", "ch1");

      // Then: executeTool is still called correctly despite the flat format
      expect(toolManager.executeTool).toHaveBeenCalledWith("read_file", { path: "foo.ts" });
      expect(result).toBe("file content");
    });
  });

  describe("clearHistory", () => {
    it("should remove conversation history for the given channel", async () => {
      // Given: a handler with history from a previous conversation
      const toneStore = createMockToneStore();
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("first response"));
      const handler = createOllamaHandler({
        apiUrl: "http://localhost:11434",
        model: "test-model",
        toneStore,
      });
      await handler.ask("hello", "channel-99");

      // When: clearing history for the channel
      handler.clearHistory?.("channel-99");

      // Then: next request sends no history (only the new user message)
      mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("fresh response"));
      await handler.ask("hi again", "channel-99");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body as string);
      const nonSystemMessages = body.messages.filter((m: { role: string }) => m.role !== "system");
      // Only the new user message should be present (no prior history)
      expect(nonSystemMessages).toHaveLength(1);
      expect(nonSystemMessages[0]).toMatchObject({ role: "user", content: "hi again" });
    });
  });
});
