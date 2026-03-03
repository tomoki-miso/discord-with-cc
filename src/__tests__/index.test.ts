import { describe, it, expect, vi, beforeAll } from "vitest";

const {
  mockCreateClaudeHandler,
  mockCreateCodexHandler,
  mockCreateGeminiHandler,
  mockCreateBot,
  mockCreateCalendarModeStore,
  mockCreateCalendarModeController,
} = vi.hoisted(() => ({
  mockCreateClaudeHandler: vi.fn(() => ({ ask: vi.fn() })),
  mockCreateCodexHandler: vi.fn(() => ({ ask: vi.fn() })),
  mockCreateGeminiHandler: vi.fn(() => ({ ask: vi.fn() })),
  mockCreateBot: vi.fn(),
  mockCreateCalendarModeStore: vi.fn(() => ({
    isActive: vi.fn(),
    setActive: vi.fn(),
    setChannelDefaultCalendar: vi.fn(),
  })),
  mockCreateCalendarModeController: vi.fn(() => ({
    handleCommand: vi.fn().mockResolvedValue(""),
    handleNaturalLanguageInput: vi
      .fn()
      .mockResolvedValue({ handled: false, response: "" }),
  })),
}));

vi.mock("../history.js", () => ({
  createSessionStore: vi.fn(() => ({})),
}));

vi.mock("../claude.js", () => ({
  createClaudeHandler: mockCreateClaudeHandler,
}));

vi.mock("../codex.js", () => ({
  createCodexHandler: mockCreateCodexHandler,
}));

vi.mock("../gemini.js", () => ({
  createGeminiHandler: mockCreateGeminiHandler,
}));

vi.mock("../bot.js", () => ({
  createBot: mockCreateBot,
}));

vi.mock("../calendar-store.js", () => ({
  createCalendarModeStore: mockCreateCalendarModeStore,
}));

vi.mock("../calendar-mode.js", () => ({
  createCalendarModeController: mockCreateCalendarModeController,
}));

vi.mock("../tone.js", () => ({
  createToneStore: vi.fn(() => ({
    get: vi.fn().mockReturnValue({ type: "preset", name: "default" }),
    set: vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue(""),
    listPresets: vi.fn().mockReturnValue(["default", "casual", "formal", "funny"]),
  })),
}));

const MOCKED_ENV_KEYS = [
  "DISCORD_TOKEN",
  "AGENT_WORK_DIR",
  "CLAUDE_WORK_DIR",
  "AGENT_TYPE",
  "CODEX_BIN",
  "GEMINI_BIN",
];

async function importIndexWithEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.clearAllMocks();
  const backups: Record<string, string | undefined> = {};
  for (const key of MOCKED_ENV_KEYS) {
    backups[key] = process.env[key];
  }

  process.env.DISCORD_TOKEN = overrides.DISCORD_TOKEN ?? backups.DISCORD_TOKEN ?? "test-token";
  const workDir = overrides.AGENT_WORK_DIR ?? backups.AGENT_WORK_DIR ?? "/tmp/test";
  process.env.AGENT_WORK_DIR = workDir;

  if (overrides.CLAUDE_WORK_DIR !== undefined) {
    process.env.CLAUDE_WORK_DIR = overrides.CLAUDE_WORK_DIR;
  } else if (backups.CLAUDE_WORK_DIR !== undefined) {
    process.env.CLAUDE_WORK_DIR = backups.CLAUDE_WORK_DIR;
  } else {
    delete process.env.CLAUDE_WORK_DIR;
  }

  if (overrides.AGENT_TYPE !== undefined) {
    process.env.AGENT_TYPE = overrides.AGENT_TYPE;
  } else if (backups.AGENT_TYPE !== undefined) {
    process.env.AGENT_TYPE = backups.AGENT_TYPE;
  } else {
    delete process.env.AGENT_TYPE;
  }

  if (overrides.CODEX_BIN !== undefined) {
    process.env.CODEX_BIN = overrides.CODEX_BIN;
  } else if (backups.CODEX_BIN !== undefined) {
    process.env.CODEX_BIN = backups.CODEX_BIN;
  } else {
    delete process.env.CODEX_BIN;
  }

  if (overrides.GEMINI_BIN !== undefined) {
    process.env.GEMINI_BIN = overrides.GEMINI_BIN;
  } else if (backups.GEMINI_BIN !== undefined) {
    process.env.GEMINI_BIN = backups.GEMINI_BIN;
  } else {
    delete process.env.GEMINI_BIN;
  }

  const mod = await import("../index.js");

  for (const key of MOCKED_ENV_KEYS) {
    if (backups[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = backups[key]!;
    }
  }

  return mod;
}

let validateEnv: (env: Record<string, string | undefined>) => { missing: { name: string; description: string }[] };
let handleToneCommand: (args: string, deps: { toneStore: any; sessionStore: any }) => string;

beforeAll(async () => {
  const mod = await importIndexWithEnv();
  validateEnv = mod.validateEnv;
  handleToneCommand = mod.handleToneCommand;
});

describe("validateEnv", () => {
  it("should report both variables when neither is set", () => {
    // Given: an environment with no variables set
    const env = {};

    // When: validating the environment
    const result = validateEnv(env);

    // Then: both DISCORD_TOKEN and CLAUDE_WORK_DIR are reported as missing
    const names = result.missing.map((v) => v.name);
    expect(names).toContain("DISCORD_TOKEN");
    expect(names).toContain("AGENT_WORK_DIR");
    expect(result.missing).toHaveLength(2);
  });

  it("should report only DISCORD_TOKEN when it is missing", () => {
    // Given: an environment with only AGENT_WORK_DIR set
    const env = { AGENT_WORK_DIR: "/some/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: only DISCORD_TOKEN is reported as missing
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].name).toBe("DISCORD_TOKEN");
  });

  it("should report only CLAUDE_WORK_DIR when it is missing", () => {
    // Given: an environment with only DISCORD_TOKEN set
    const env = { DISCORD_TOKEN: "some-token" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: only CLAUDE_WORK_DIR is reported as missing
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].name).toBe("AGENT_WORK_DIR");
  });

  it("should report no missing variables when all are set", () => {
    // Given: an environment with all required variables set
    const env = { DISCORD_TOKEN: "some-token", AGENT_WORK_DIR: "/some/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: no variables are reported as missing
    expect(result.missing).toHaveLength(0);
  });

  it("should accept CLAUDE_WORK_DIR for backwards compatibility", () => {
    // Given: only the legacy variable is set
    const env = { DISCORD_TOKEN: "token", CLAUDE_WORK_DIR: "/legacy/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: no missing variables are reported
    expect(result.missing).toHaveLength(0);
  });
});

describe("handleToneCommand", () => {
  function createDeps() {
    let currentTone: { type: "preset"; name: string } | { type: "custom"; prompt: string } = {
      type: "preset",
      name: "default",
    };
    const toneStore = {
      get: vi.fn(() => currentTone),
      set: vi.fn((nameOrPrompt: string) => {
        const presets = ["default", "casual", "formal", "funny"];
        if (presets.includes(nameOrPrompt)) {
          currentTone = { type: "preset", name: nameOrPrompt };
        } else {
          currentTone = { type: "custom", prompt: nameOrPrompt };
        }
      }),
      getSystemPrompt: vi.fn().mockReturnValue(""),
      listPresets: vi.fn().mockReturnValue(["default", "casual", "formal", "funny"]),
    };
    const sessionStore = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    };
    return { toneStore, sessionStore };
  }

  it("should show current tone and presets when args is empty", () => {
    // Given: default tone deps
    const deps = createDeps();

    // When: calling with empty args
    const result = handleToneCommand("", deps);

    // Then: shows current tone and available presets in Japanese
    expect(result).toContain("default");
    expect(result).toContain("利用可能なプリセット");
  });

  it("should switch to a valid preset", () => {
    // Given: default tone deps
    const deps = createDeps();

    // When: switching to casual
    const result = handleToneCommand("casual", deps);

    // Then: confirms change and clears sessions
    expect(result).toContain("casual");
    expect(deps.toneStore.set).toHaveBeenCalledWith("casual");
    expect(deps.sessionStore.clear).toHaveBeenCalled();
  });

  it("should reject unknown preset name", () => {
    // Given: default tone deps
    const deps = createDeps();

    // When: trying an unknown preset
    const result = handleToneCommand("unknown", deps);

    // Then: shows error with available presets in Japanese
    expect(result).toContain("不明なプリセット");
    expect(result).toContain("unknown");
  });

  it("should set custom prompt with 'set' subcommand", () => {
    // Given: default tone deps
    const deps = createDeps();

    // When: setting a custom prompt
    const result = handleToneCommand("set Be a pirate", deps);

    // Then: sets custom prompt and clears sessions
    expect(deps.toneStore.set).toHaveBeenCalledWith("Be a pirate");
    expect(deps.sessionStore.clear).toHaveBeenCalled();
    expect(result).toContain("カスタムトーンを設定しました");
  });

  it("should reject empty custom prompt", () => {
    // Given: default tone deps
    const deps = createDeps();

    // When: setting empty custom prompt
    const result = handleToneCommand("set ", deps);

    // Then: shows usage hint in Japanese
    expect(result).toContain("カスタムプロンプトを入力してください");
  });

  it("should reset to default", () => {
    // Given: deps with tone set to casual
    const deps = createDeps();
    deps.toneStore.set("casual");

    // When: resetting
    const result = handleToneCommand("reset", deps);

    // Then: resets to default and clears sessions
    expect(deps.toneStore.set).toHaveBeenCalledWith("default");
    expect(deps.sessionStore.clear).toHaveBeenCalled();
    expect(result).toContain("デフォルトにリセットしました");
  });
});

describe("agent selection", () => {
  it("uses Claude handler by default", async () => {
    await importIndexWithEnv();
    expect(mockCreateClaudeHandler).toHaveBeenCalledTimes(1);
    expect(mockCreateCodexHandler).not.toHaveBeenCalled();
    expect(mockCreateGeminiHandler).not.toHaveBeenCalled();
  });

  it("uses Codex handler when AGENT_TYPE=codex", async () => {
    await importIndexWithEnv({ AGENT_TYPE: "codex" });
    expect(mockCreateCodexHandler).toHaveBeenCalledTimes(1);
    expect(mockCreateClaudeHandler).not.toHaveBeenCalled();
    expect(mockCreateGeminiHandler).not.toHaveBeenCalled();
  });

  it("uses Gemini handler when AGENT_TYPE=gemini", async () => {
    await importIndexWithEnv({ AGENT_TYPE: "gemini" });
    expect(mockCreateGeminiHandler).toHaveBeenCalledTimes(1);
    expect(mockCreateClaudeHandler).not.toHaveBeenCalled();
    expect(mockCreateCodexHandler).not.toHaveBeenCalled();
  });

  it("falls back to Claude handler for unknown values", async () => {
    await importIndexWithEnv({ AGENT_TYPE: "unknown" });
    expect(mockCreateClaudeHandler).toHaveBeenCalledTimes(1);
    expect(mockCreateCodexHandler).not.toHaveBeenCalled();
    expect(mockCreateGeminiHandler).not.toHaveBeenCalled();
  });
});

describe("bootstrap wiring", () => {
  it("wires calendar handlers into the Discord bot", async () => {
    await importIndexWithEnv();
    expect(mockCreateCalendarModeStore).toHaveBeenCalled();
    expect(mockCreateCalendarModeController).toHaveBeenCalled();
    const botArgs = mockCreateBot.mock.calls.at(-1)?.[0];
    expect(botArgs).toBeDefined();
    expect(typeof botArgs.onCalendarCommand).toBe("function");
    expect(typeof botArgs.onCalendarInput).toBe("function");
  });
});
