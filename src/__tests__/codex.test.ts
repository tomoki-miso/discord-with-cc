import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRunCommand, mockMkdtemp, mockReadFile, mockRm } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
  mockMkdtemp: vi.fn(),
  mockReadFile: vi.fn(),
  mockRm: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: mockMkdtemp,
  readFile: mockReadFile,
  rm: mockRm,
}));

vi.mock("../process.js", () => ({
  runCommand: mockRunCommand,
}));

import { createCodexHandler } from "../codex.js";

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
    clearChannel: vi.fn(),
  };
}

describe("createCodexHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdtemp.mockResolvedValue("/tmp/codex-123");
    mockReadFile.mockResolvedValue("結果です\n");
    mockRm.mockResolvedValue(undefined);
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("runs codex exec with composed prompt and returns file output", async () => {
    const toneStore = createToneStore("丁寧に返答してください。");
    const handler = createCodexHandler({
      cwd: "/repo",
      toneStore,
      sessionStore: createSessionStore(),
      binary: "codex",
    });

    const result = await handler.ask("Hello from Discord", "channel-1");

    expect(result).toBe("結果です");
    expect(mockRunCommand).toHaveBeenCalledTimes(1);
    const [command, args] = mockRunCommand.mock.calls[0];
    expect(command).toBe("codex");
    expect(args).toContain("exec");
    expect(args).toContain("--output-last-message");
    const promptArg = args[args.length - 1];
    expect(promptArg).toContain("Discord bot");
    expect(promptArg).toContain("Hello from Discord");
    expect(promptArg).toContain("丁寧に返答してください");
    expect(mockRm).toHaveBeenCalledWith("/tmp/codex-123", { recursive: true, force: true });
  });

  it("falls back to stdout when result file is missing", async () => {
    mockReadFile.mockRejectedValue(new Error("missing"));
    mockRunCommand.mockResolvedValue({ stdout: "Hello\n", stderr: "", exitCode: 0 });
    const handler = createCodexHandler({
      cwd: "/repo",
      toneStore: createToneStore(),
      sessionStore: createSessionStore(),
      binary: "codex",
    });

    const result = await handler.ask("Ping", "channel");
    expect(result).toBe("Hello");
  });

  it("returns error text when CLI exits with non-zero code", async () => {
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "boom", exitCode: 1 });
    const handler = createCodexHandler({
      cwd: "/repo",
      toneStore: createToneStore(),
      sessionStore: createSessionStore(),
      binary: "codex",
    });

    const result = await handler.ask("Hi", "channel");
    expect(result).toContain("Error:");
    expect(result).toContain("Codex CLI exited with code 1");
    expect(result).toContain("boom");
  });
});
