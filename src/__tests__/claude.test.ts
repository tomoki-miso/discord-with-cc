import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

import { createClaudeHandler } from "../claude.js";

function createMockSessionStore() {
  const map = new Map<string, string>();
  return {
    get: vi.fn((channelId: string) => map.get(channelId)),
    set: vi.fn((channelId: string, sessionId: string) => {
      map.set(channelId, sessionId);
    }),
    clear: vi.fn(() => map.clear()),
    clearChannel: vi.fn((channelId: string) => map.delete(channelId)),
  };
}

function createMockToneStore(systemPrompt = "") {
  return {
    get: vi.fn().mockReturnValue({ type: "preset" as const, name: "default" }),
    set: vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue(systemPrompt),
    listPresets: vi.fn().mockReturnValue(["default", "casual", "formal", "funny"]),
  };
}

function mockAsyncGenerator(messages: SDKMessage[]): AsyncGenerator<SDKMessage> {
  return (async function* () {
    for (const msg of messages) {
      yield msg;
    }
  })();
}

function systemInitMessage(sessionId: string): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    apiKeySource: "user",
    claude_code_version: "1.0.0",
    cwd: "/test",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-20250514",
    permissionMode: "bypassPermissions",
    slash_commands: [],
    output_style: "text",
    skills: [],
    plugins: [],
    uuid: "00000000-0000-0000-0000-000000000000" as `${string}-${string}-${string}-${string}-${string}`,
  } as unknown as SDKMessage;
}

function successResultMessage(result: string, sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    result,
    session_id: sessionId,
    duration_ms: 100,
    duration_api_ms: 80,
    is_error: false,
    num_turns: 1,
    stop_reason: "end_turn",
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
  } as unknown as SDKMessage;
}

function errorResultMessage(errors: string[], sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    session_id: sessionId,
    duration_ms: 100,
    duration_api_ms: 80,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null },
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
  } as unknown as SDKMessage;
}

describe("createClaudeHandler", () => {
  let sessionStore: ReturnType<typeof createMockSessionStore>;
  let toneStore: ReturnType<typeof createMockToneStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore = createMockSessionStore();
    toneStore = createMockToneStore();
  });

  it("should call query with prompt and configured cwd", async () => {
    // Given: a handler configured with a specific cwd
    const handler = createClaudeHandler({ cwd: "/work/dir", sessionStore, toneStore });
    mockQuery.mockReturnValue(
      mockAsyncGenerator([
        systemInitMessage("sess-1"),
        successResultMessage("Hello!", "sess-1"),
      ]),
    );

    // When: asking a question
    await handler.ask("test prompt", "channel-1");

    // Then: query is called with the prompt and cwd
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "test prompt",
        options: expect.objectContaining({
          cwd: "/work/dir",
        }),
      }),
    );
  });

  describe("permission configuration", () => {
    it("should not use bypassPermissions mode", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: permissionMode is not bypassPermissions and dangerous skip is not enabled
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.permissionMode).not.toBe("bypassPermissions");
      expect(callArgs.options.allowDangerouslySkipPermissions).not.toBe(true);
    });

    it("should provide allowedTools as a non-empty array", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: allowedTools is a non-empty string array
      const callArgs = mockQuery.mock.calls[0][0];
      const allowedTools: string[] = callArgs.options.allowedTools;
      expect(Array.isArray(allowedTools)).toBe(true);
      expect(allowedTools.length).toBeGreaterThan(0);
    });

    it("should allow npm and node development commands", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: allowedTools includes npm and node commands
      const callArgs = mockQuery.mock.calls[0][0];
      const allowedTools: string[] = callArgs.options.allowedTools;
      expect(allowedTools).toContain("Bash(npm run *)");
      expect(allowedTools).toContain("Bash(node *)");
    });

    it("should allow safe git operations but not push", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: allowedTools includes safe git commands
      const callArgs = mockQuery.mock.calls[0][0];
      const allowedTools: string[] = callArgs.options.allowedTools;
      expect(allowedTools).toContain("Bash(git status)");
      expect(allowedTools).toContain("Bash(git diff *)");
      expect(allowedTools).toContain("Bash(git log *)");

      // And: git push is NOT allowed
      const hasPush = allowedTools.some((tool: string) =>
        tool.includes("git push"),
      );
      expect(hasPush).toBe(false);
    });

    it("should not allow destructive or network commands", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: allowedTools does not include dangerous commands
      const callArgs = mockQuery.mock.calls[0][0];
      const allowedTools: string[] = callArgs.options.allowedTools;
      const hasRmRf = allowedTools.some((tool: string) =>
        tool.includes("rm -rf"),
      );
      const hasCurl = allowedTools.some((tool: string) =>
        tool.includes("curl"),
      );
      const hasWget = allowedTools.some((tool: string) =>
        tool.includes("wget"),
      );
      expect(hasRmRf).toBe(false);
      expect(hasCurl).toBe(false);
      expect(hasWget).toBe(false);
    });

    it("should disallow reading .env files", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: disallowedTools includes .env read restrictions
      const callArgs = mockQuery.mock.calls[0][0];
      const disallowedTools: string[] = callArgs.options.disallowedTools;
      expect(disallowedTools).toContain("Read(.env)");
      expect(disallowedTools).toContain("Read(.env.*)");
    });

    it("should disallow editing and writing .env files", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: disallowedTools includes .env edit and write restrictions
      const callArgs = mockQuery.mock.calls[0][0];
      const disallowedTools: string[] = callArgs.options.disallowedTools;
      expect(disallowedTools).toContain("Edit(.env)");
      expect(disallowedTools).toContain("Edit(.env.*)");
      expect(disallowedTools).toContain("Write(.env)");
      expect(disallowedTools).toContain("Write(.env.*)");
    });

    it("should disallow bash access to .env files", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: disallowedTools blocks bash commands that could read .env
      const callArgs = mockQuery.mock.calls[0][0];
      const disallowedTools: string[] = callArgs.options.disallowedTools;
      expect(disallowedTools).toContain("Bash(cat .env*)");
      expect(disallowedTools).toContain("Bash(head .env*)");
      expect(disallowedTools).toContain("Bash(tail .env*)");
      expect(disallowedTools).toContain("Bash(grep * .env*)");
    });

    it("should disallow destructive and network bash commands", async () => {
      // Given: a handler
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: disallowedTools includes destructive and network commands
      const callArgs = mockQuery.mock.calls[0][0];
      const disallowedTools: string[] = callArgs.options.disallowedTools;
      expect(disallowedTools).toContain("Bash(rm -rf *)");
      expect(disallowedTools).toContain("Bash(git push *)");
      expect(disallowedTools).toContain("Bash(curl *)");
      expect(disallowedTools).toContain("Bash(wget *)");
    });
  });

  it("should not pass resume when no existing session", async () => {
    // Given: a handler with an empty session store
    const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
    mockQuery.mockReturnValue(
      mockAsyncGenerator([
        systemInitMessage("sess-1"),
        successResultMessage("OK", "sess-1"),
      ]),
    );

    // When: asking for the first time
    await handler.ask("prompt", "channel-1");

    // Then: resume is not set in options
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.resume).toBeUndefined();
  });

  it("should pass resume with session ID when session exists", async () => {
    // Given: a handler with an existing session in the store
    const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
    sessionStore.set("channel-1", "existing-session");
    mockQuery.mockReturnValue(
      mockAsyncGenerator([
        systemInitMessage("existing-session"),
        successResultMessage("OK", "existing-session"),
      ]),
    );

    // When: asking a question for a channel with existing session
    await handler.ask("prompt", "channel-1");

    // Then: resume is set to the existing session ID
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          resume: "existing-session",
        }),
      }),
    );
  });

  it("should save session_id from init message", async () => {
    // Given: a handler with an empty session store
    const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
    mockQuery.mockReturnValue(
      mockAsyncGenerator([
        systemInitMessage("new-session-id"),
        successResultMessage("OK", "new-session-id"),
      ]),
    );

    // When: asking a question
    await handler.ask("prompt", "channel-1");

    // Then: the session ID from init message is saved
    expect(sessionStore.set).toHaveBeenCalledWith("channel-1", "new-session-id");
  });

  it("should return result text on success", async () => {
    // Given: a handler with SDK returning a successful result
    const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
    mockQuery.mockReturnValue(
      mockAsyncGenerator([
        systemInitMessage("sess-1"),
        successResultMessage("The answer is 42", "sess-1"),
      ]),
    );

    // When: asking a question
    const result = await handler.ask("What is the answer?", "channel-1");

    // Then: returns the result text
    expect(result).toBe("The answer is 42");
  });

  it("should return error message when SDK returns error result", async () => {
    // Given: a handler with SDK returning an error result
    const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
    mockQuery.mockReturnValue(
      mockAsyncGenerator([
        systemInitMessage("sess-1"),
        errorResultMessage(["Something went wrong"], "sess-1"),
      ]),
    );

    // When: asking a question
    const result = await handler.ask("prompt", "channel-1");

    // Then: returns an error message string (not throwing)
    expect(typeof result).toBe("string");
    expect(result).toContain("Something went wrong");
  });

  describe("system prompt injection", () => {
    it("should always include Discord bot context in systemPrompt", async () => {
      // Given: a handler with default tone (empty system prompt)
      const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: systemPrompt is set with Discord bot context
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.systemPrompt).toEqual({
        type: "preset",
        preset: "claude_code",
        append: expect.stringContaining("Discord bot"),
      });
    });

    it("should append tone prompt after Discord bot context when tone is set", async () => {
      // Given: a handler with a non-default tone
      const customToneStore = createMockToneStore("Be casual and friendly.");
      const handler = createClaudeHandler({
        cwd: "/work",
        sessionStore,
        toneStore: customToneStore,
      });
      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          systemInitMessage("sess-1"),
          successResultMessage("OK", "sess-1"),
        ]),
      );

      // When: asking a question
      await handler.ask("prompt", "channel-1");

      // Then: systemPrompt contains both Discord bot context and tone
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.systemPrompt).toEqual({
        type: "preset",
        preset: "claude_code",
        append: expect.stringContaining("Be casual and friendly."),
      });
      expect(callArgs.options.systemPrompt.append).toContain("Discord bot");
    });
  });

  it("should return error message when SDK throws an exception", async () => {
    // Given: a handler with SDK that throws
    const handler = createClaudeHandler({ cwd: "/work", sessionStore, toneStore });
    mockQuery.mockImplementation(() => {
      throw new Error("SDK connection failed");
    });

    // When: asking a question
    const result = await handler.ask("prompt", "channel-1");

    // Then: returns an error message string (not throwing)
    expect(typeof result).toBe("string");
    expect(result).toContain("SDK connection failed");
  });
});

describe("clearHistory", () => {
  it("should call clearChannel on sessionStore for the given channelId", () => {
    // Given: a claude handler with a session store
    const sessionStore = createMockSessionStore();
    const toneStore = createMockToneStore();
    const handler = createClaudeHandler({ cwd: "/test", sessionStore, toneStore });

    // When: clearHistory is called for a channel
    handler.clearHistory?.("channel-42");

    // Then: sessionStore.clearChannel is called with the channel ID
    expect(sessionStore.clearChannel).toHaveBeenCalledWith("channel-42");
  });
});
