import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunCommand } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
}));

vi.mock("../process.js", () => ({
  runCommand: mockRunCommand,
}));

import { createGeminiHandler } from "../gemini.js";

function createToneStore(systemPrompt = "") {
  return {
    getSystemPrompt: vi.fn(() => systemPrompt),
    get: vi.fn(),
    set: vi.fn(),
    listPresets: vi.fn(() => []),
  };
}

function createSessionStore() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  };
}

describe("createGeminiHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("invokes gemini CLI with prompt and strips log lines", async () => {
    mockRunCommand.mockResolvedValue({
      stdout: "Loading extension: demo\nData collection is disabled.\n回答です\n",
      stderr: "",
      exitCode: 0,
    });
    const handler = createGeminiHandler({
      cwd: "/repo",
      toneStore: createToneStore("落ち着いた文体で。"),
      sessionStore: createSessionStore(),
      binary: "gemini",
    });

    const result = await handler.ask("Summarize", "channel");
    expect(result).toBe("回答です");
    expect(mockRunCommand).toHaveBeenCalledTimes(1);
    const [command, args] = mockRunCommand.mock.calls[0];
    expect(command).toBe("gemini");
    expect(args[0]).toBe("--prompt");
    expect(args[1]).toContain("Summarize");
    expect(args[1]).toContain("Discord bot");
    expect(args[1]).toContain("落ち着いた文体");
    expect(args).toContain("--yolo");
  });

  it("returns error text when CLI fails", async () => {
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "boom", exitCode: 2 });
    const handler = createGeminiHandler({
      cwd: "/repo",
      toneStore: createToneStore(),
      sessionStore: createSessionStore(),
    });

    const response = await handler.ask("Hello", "channel");
    expect(response).toContain("Gemini CLI exited with code 2");
    expect(response).toContain("boom");
  });
});
