import { describe, it, expect, vi } from "vitest";

vi.mock("../history.js", () => ({
  createSessionStore: vi.fn(() => ({})),
}));

vi.mock("../claude.js", () => ({
  createClaudeHandler: vi.fn(() => ({ ask: vi.fn() })),
}));

vi.mock("../bot.js", () => ({
  createBot: vi.fn(),
}));

vi.mock("../tone.js", () => ({
  createToneStore: vi.fn(() => ({
    get: vi.fn().mockReturnValue({ type: "preset", name: "default" }),
    set: vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue(""),
    listPresets: vi.fn().mockReturnValue(["default", "casual", "formal", "funny"]),
  })),
}));

// Set env vars before importing index.ts so top-level code does not call process.exit
process.env.DISCORD_TOKEN = "test-token";
process.env.CLAUDE_WORK_DIR = "/tmp/test";

const { validateEnv, handleToneCommand } = await import("../index.js");

describe("validateEnv", () => {
  it("should report both variables when neither is set", () => {
    // Given: an environment with no variables set
    const env = {};

    // When: validating the environment
    const result = validateEnv(env);

    // Then: both DISCORD_TOKEN and CLAUDE_WORK_DIR are reported as missing
    const names = result.missing.map((v) => v.name);
    expect(names).toContain("DISCORD_TOKEN");
    expect(names).toContain("CLAUDE_WORK_DIR");
    expect(result.missing).toHaveLength(2);
  });

  it("should report only DISCORD_TOKEN when it is missing", () => {
    // Given: an environment with only CLAUDE_WORK_DIR set
    const env = { CLAUDE_WORK_DIR: "/some/path" };

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
    expect(result.missing[0].name).toBe("CLAUDE_WORK_DIR");
  });

  it("should report no missing variables when all are set", () => {
    // Given: an environment with all required variables set
    const env = { DISCORD_TOKEN: "some-token", CLAUDE_WORK_DIR: "/some/path" };

    // When: validating the environment
    const result = validateEnv(env);

    // Then: no variables are reported as missing
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
