import { describe, it, expect, vi, beforeAll } from "vitest";

const {
  mockCreateClaudeHandler,
  mockCreateCodexHandler,
  mockCreateGeminiHandler,
  mockCreateOllamaHandler,
  mockCreateBot,
  mockCreateCalendarModeStore,
  mockCreateCalendarModeController,
  mockRegisterSlashCommands,
} = vi.hoisted(() => ({
  mockCreateClaudeHandler: vi.fn(() => ({ ask: vi.fn() })),
  mockCreateCodexHandler: vi.fn(() => ({ ask: vi.fn() })),
  mockCreateGeminiHandler: vi.fn(() => ({ ask: vi.fn() })),
  mockCreateOllamaHandler: vi.fn(() => ({ ask: vi.fn() })),
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
  mockRegisterSlashCommands: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../ollama.js", () => ({
  createOllamaHandler: mockCreateOllamaHandler,
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

vi.mock("../discord/slash-register.js", () => ({
  registerSlashCommands: mockRegisterSlashCommands,
}));

const MOCKED_ENV_KEYS = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "AGENT_WORK_DIR",
  "CLAUDE_WORK_DIR",
  "AGENT_TYPE",
  "CODEX_BIN",
  "GEMINI_BIN",
  "OLLAMA_URL",
  "OLLAMA_MODEL",
];

async function importIndexWithEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.clearAllMocks();
  const backups: Record<string, string | undefined> = {};
  for (const key of MOCKED_ENV_KEYS) {
    backups[key] = process.env[key];
  }

  process.env.DISCORD_TOKEN = overrides.DISCORD_TOKEN ?? backups.DISCORD_TOKEN ?? "test-token";
  process.env.DISCORD_CLIENT_ID = overrides.DISCORD_CLIENT_ID ?? backups.DISCORD_CLIENT_ID ?? "test-client-id";
  const workDir = overrides.AGENT_WORK_DIR ?? backups.AGENT_WORK_DIR ?? "/tmp/test";
  process.env.AGENT_WORK_DIR = workDir;

  if (overrides.DISCORD_GUILD_ID !== undefined) {
    process.env.DISCORD_GUILD_ID = overrides.DISCORD_GUILD_ID;
  } else if (backups.DISCORD_GUILD_ID !== undefined) {
    process.env.DISCORD_GUILD_ID = backups.DISCORD_GUILD_ID;
  } else {
    delete process.env.DISCORD_GUILD_ID;
  }

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

  if (overrides.OLLAMA_URL !== undefined) {
    process.env.OLLAMA_URL = overrides.OLLAMA_URL;
  } else if (backups.OLLAMA_URL !== undefined) {
    process.env.OLLAMA_URL = backups.OLLAMA_URL;
  } else {
    delete process.env.OLLAMA_URL;
  }

  if (overrides.OLLAMA_MODEL !== undefined) {
    process.env.OLLAMA_MODEL = overrides.OLLAMA_MODEL;
  } else if (backups.OLLAMA_MODEL !== undefined) {
    process.env.OLLAMA_MODEL = backups.OLLAMA_MODEL;
  } else {
    delete process.env.OLLAMA_MODEL;
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
let parseOllamaOptions: (env: Record<string, string | undefined>) => Record<string, unknown>;

beforeAll(async () => {
  const mod = await importIndexWithEnv();
  validateEnv = mod.validateEnv;
  handleToneCommand = mod.handleToneCommand;
  parseOllamaOptions = mod.parseOllamaOptions;
});

describe("validateEnv", () => {
  it("should report missing variables when none are set", () => {
    // Given: an environment with no variables set
    const env = {};

    // When: validating the environment
    const result = validateEnv(env);

    // Then: DISCORD_TOKEN, DISCORD_CLIENT_ID, and AGENT_WORK_DIR are reported as missing
    const names = result.missing.map((v) => v.name);
    expect(names).toContain("DISCORD_TOKEN");
    expect(names).toContain("DISCORD_CLIENT_ID");
    expect(names).toContain("AGENT_WORK_DIR");
  });

  it("should report only DISCORD_TOKEN when it is missing", () => {
    // Given: an environment with DISCORD_CLIENT_ID and AGENT_WORK_DIR set
    const env = { DISCORD_CLIENT_ID: "client-id", AGENT_WORK_DIR: "/some/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: only DISCORD_TOKEN is reported as missing
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].name).toBe("DISCORD_TOKEN");
  });

  it("should report only DISCORD_CLIENT_ID when it is missing", () => {
    // Given: an environment with DISCORD_TOKEN and AGENT_WORK_DIR set
    const env = { DISCORD_TOKEN: "some-token", AGENT_WORK_DIR: "/some/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: only DISCORD_CLIENT_ID is reported as missing
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].name).toBe("DISCORD_CLIENT_ID");
  });

  it("should report only CLAUDE_WORK_DIR when it is missing", () => {
    // Given: an environment with only DISCORD_TOKEN and DISCORD_CLIENT_ID set
    const env = { DISCORD_TOKEN: "some-token", DISCORD_CLIENT_ID: "client-id" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: only AGENT_WORK_DIR is reported as missing
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].name).toBe("AGENT_WORK_DIR");
  });

  it("should report no missing variables when all are set", () => {
    // Given: an environment with all required variables set
    const env = { DISCORD_TOKEN: "some-token", DISCORD_CLIENT_ID: "client-id", AGENT_WORK_DIR: "/some/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: no variables are reported as missing
    expect(result.missing).toHaveLength(0);
  });

  it("should accept CLAUDE_WORK_DIR for backwards compatibility", () => {
    // Given: only the legacy variable is set
    const env = { DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "client-id", CLAUDE_WORK_DIR: "/legacy/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: no missing variables are reported
    expect(result.missing).toHaveLength(0);
  });

  it("should require OLLAMA_MODEL when AGENT_TYPE=ollama", () => {
    // Given: ollama agent type without OLLAMA_MODEL
    const env = { DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "client-id", AGENT_WORK_DIR: "/path", AGENT_TYPE: "ollama" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: OLLAMA_MODEL is reported as missing
    expect(result.missing.map((v) => v.name)).toContain("OLLAMA_MODEL");
  });

  it("should not require OLLAMA_MODEL when AGENT_TYPE is not ollama", () => {
    // Given: non-ollama agent type without OLLAMA_MODEL
    const env = { DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "client-id", AGENT_WORK_DIR: "/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: OLLAMA_MODEL is not reported as missing
    expect(result.missing.map((v) => v.name)).not.toContain("OLLAMA_MODEL");
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

  it("uses Ollama handler when AGENT_TYPE=ollama", async () => {
    await importIndexWithEnv({ AGENT_TYPE: "ollama", OLLAMA_MODEL: "llama3.2" });
    expect(mockCreateOllamaHandler).toHaveBeenCalledTimes(1);
    expect(mockCreateClaudeHandler).not.toHaveBeenCalled();
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

  it("should pass onClearCommand to createBot", async () => {
    // Given/When: createBot is called (via index.ts startup)
    await importIndexWithEnv();

    // Then: onClearCommand is provided in the bot config
    const botConfig = mockCreateBot.mock.calls.at(-1)?.[0];
    expect(botConfig.onClearCommand).toBeDefined();
    expect(typeof botConfig.onClearCommand).toBe("function");
  });

  it("should clear handler history when onClearCommand is called", async () => {
    // Given: the onClearCommand from bot config
    await importIndexWithEnv();
    const botConfig = mockCreateBot.mock.calls.at(-1)?.[0];
    const onClearCommand = botConfig.onClearCommand as (channelId: string) => string;

    // When: onClearCommand is called
    const result = onClearCommand("channel-42");

    // Then: returns confirmation message
    expect(result).toBe("このチャンネルのコンテキストをクリアしました。");
  });

  it("should call registerSlashCommands when DISCORD_GUILD_ID is set", async () => {
    // Given: DISCORD_GUILD_ID is set
    await importIndexWithEnv({ DISCORD_GUILD_ID: "guild-123" });

    // Then: registerSlashCommands is called with token, clientId, and guildId
    await vi.waitFor(() => expect(mockRegisterSlashCommands).toHaveBeenCalled());
    expect(mockRegisterSlashCommands).toHaveBeenCalledWith(
      "test-token",
      "test-client-id",
      "guild-123",
    );
  });

  it("should skip registerSlashCommands when DISCORD_GUILD_ID is not set", async () => {
    // Given: DISCORD_GUILD_ID is not set
    await importIndexWithEnv({ DISCORD_GUILD_ID: undefined });

    // When: index.ts is loaded
    // Then: registerSlashCommands is not called
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockRegisterSlashCommands).not.toHaveBeenCalled();
  });
});

describe("parseOllamaOptions", () => {
  it("returns empty object when no OLLAMA_ env vars are set", () => {
    const result = parseOllamaOptions({});
    expect(result).toEqual({});
  });

  it("parses OLLAMA_TEMPERATURE as float", () => {
    const result = parseOllamaOptions({ OLLAMA_TEMPERATURE: "0.7" });
    expect(result.temperature).toBe(0.7);
  });

  it("parses OLLAMA_NUM_CTX as integer", () => {
    const result = parseOllamaOptions({ OLLAMA_NUM_CTX: "4096" });
    expect(result.num_ctx).toBe(4096);
  });

  it("parses OLLAMA_TOP_P as float", () => {
    const result = parseOllamaOptions({ OLLAMA_TOP_P: "0.95" });
    expect(result.top_p).toBe(0.95);
  });

  it("parses OLLAMA_NUM_PREDICT as integer", () => {
    const result = parseOllamaOptions({ OLLAMA_NUM_PREDICT: "512" });
    expect(result.num_predict).toBe(512);
  });

  it("parses all options together", () => {
    const result = parseOllamaOptions({
      OLLAMA_TEMPERATURE: "0.5",
      OLLAMA_NUM_CTX: "2048",
      OLLAMA_TOP_P: "0.9",
      OLLAMA_NUM_PREDICT: "256",
    });
    expect(result).toEqual({ temperature: 0.5, num_ctx: 2048, top_p: 0.9, num_predict: 256 });
  });
});
