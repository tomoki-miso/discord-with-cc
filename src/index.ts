import { join } from "node:path";
import { createSessionStore } from "./history.js";
import { createClaudeHandler } from "./claude.js";
import { createCodexHandler } from "./codex.js";
import { createGeminiHandler } from "./gemini.js";
import { createOllamaHandler } from "./ollama.js";
import { createBot } from "./bot.js";
import { createToneStore } from "./tone.js";
import { createCalendarModeStore } from "./calendar-store.js";
import { createCalendarModeController } from "./calendar-mode.js";
import { createChannelModeStore } from "./channel-store.js";
import { createChannelModeController } from "./channel-mode.js";
import { normalizeAgentType, formatSupportedAgents, type AgentType, type AgentHandler } from "./agent.js";

export function resolveWorkDir(env: Record<string, string | undefined>): string | undefined {
  return env.AGENT_WORK_DIR ?? env.CLAUDE_WORK_DIR;
}

export function validateEnv(env: Record<string, string | undefined>): {
  missing: { name: string; description: string }[];
} {
  const missing: { name: string; description: string }[] = [];

  if (!env.DISCORD_TOKEN) {
    missing.push({ name: "DISCORD_TOKEN", description: "Discord Botのトークン" });
  }

  if (!resolveWorkDir(env)) {
    missing.push({
      name: "AGENT_WORK_DIR",
      description: "エージェントが操作する作業ディレクトリ (AGENT_WORK_DIR または CLAUDE_WORK_DIR)",
    });
  }

  const agentTypeForValidation = (env.AGENT_TYPE ?? "").trim().toLowerCase();
  if (agentTypeForValidation === "ollama" && !env.OLLAMA_MODEL) {
    missing.push({
      name: "OLLAMA_MODEL",
      description: "Ollamaで使用するモデル名（例: llama3.2, mistral）",
    });
  }

  return { missing };
}

const { missing } = validateEnv(process.env);

if (missing.length > 0) {
  const list = missing.map((v) => `  - ${v.name}: ${v.description}`).join("\n");
  process.stderr.write(
    `⚠ 環境変数が設定されていません:\n\n${list}\n\n開発環境の場合は .env.dev ファイルに設定してください。\n例:\n  DISCORD_TOKEN=your-discord-bot-token\n  AGENT_WORK_DIR=/path/to/work/dir\n  AGENT_TYPE=claude  # 利用可能: ${formatSupportedAgents()}\n`,
  );
  process.exit(1);
}

const discordToken = process.env.DISCORD_TOKEN!;
const workDir = resolveWorkDir(process.env)!;
const agentType = normalizeAgentType(process.env.AGENT_TYPE);

const agentLabel = (() => {
  switch (agentType) {
    case "ollama":
      return `ollama (${process.env.OLLAMA_MODEL})`;
    case "codex":
      return process.env.CODEX_BIN ? `codex (${process.env.CODEX_BIN})` : "codex";
    case "gemini":
      return process.env.GEMINI_BIN ? `gemini (${process.env.GEMINI_BIN})` : "gemini";
    default:
      return "claude";
  }
})();
process.stderr.write(`🤖 Agent: ${agentLabel}\n`);

const sessionStore = createSessionStore();
const toneStore = createToneStore({ filePath: join(workDir, "tone.json") });
const calendarStore = createCalendarModeStore({ filePath: join(workDir, "calendar-mode.json") });
const calendarController = createCalendarModeController({ store: calendarStore });
const channelStore = createChannelModeStore({ filePath: join(workDir, "channel-mode.json") });
const channelController = createChannelModeController({ store: channelStore });
const handler = createHandlerForAgent(agentType, { cwd: workDir, sessionStore, toneStore });

export function handleToneCommand(
  args: string,
  deps: { toneStore: ReturnType<typeof createToneStore>; sessionStore: ReturnType<typeof createSessionStore> },
): string {
  if (args === "") {
    const current = deps.toneStore.get();
    const presets = deps.toneStore.listPresets().join(", ");
    const currentLabel =
      current.type === "preset" ? current.name : `カスタム: "${current.prompt}"`;
    return `現在のトーン: ${currentLabel}\n利用可能なプリセット: ${presets}\n使い方: !tone <プリセット名> | !tone set <テキスト> | !tone reset`;
  }

  if (args === "reset") {
    deps.toneStore.set("default");
    deps.sessionStore.clear();
    return "トーンをデフォルトにリセットしました。";
  }

  if (args.startsWith("set ")) {
    const customPrompt = args.slice("set ".length).trim();
    if (!customPrompt) {
      return "カスタムプロンプトを入力してください。使い方: !tone set <テキスト>";
    }
    deps.toneStore.set(customPrompt);
    deps.sessionStore.clear();
    return "カスタムトーンを設定しました。セッションをクリアしました。";
  }

  const presetName = args;
  const presets = deps.toneStore.listPresets();
  if (!presets.includes(presetName)) {
    return `不明なプリセット「${presetName}」です。利用可能: ${presets.join(", ")}`;
  }

  deps.toneStore.set(presetName);
  deps.sessionStore.clear();
  return `トーンを「${presetName}」に変更しました。セッションをクリアしました。`;
}

createBot({
  token: discordToken,
  onMessage: (prompt, channelId) => handler.ask(prompt, channelId),
  onToneCommand: (args) => handleToneCommand(args, { toneStore, sessionStore }),
  onCalendarCommand: (args, channelId) => calendarController.handleCommand(args, channelId),
  onCalendarInput: (content, channelId) => calendarController.handleNaturalLanguageInput(content, channelId),
  onChannelCommand: (args, channelId) => channelController.handleCommand(args, channelId),
  isAlwaysOnChannel: (channelId) => channelStore.isAlwaysOn(channelId),
});

type HandlerDeps = {
  cwd: string;
  sessionStore: ReturnType<typeof createSessionStore>;
  toneStore: ReturnType<typeof createToneStore>;
};

function createHandlerForAgent(agentType: AgentType, deps: HandlerDeps): AgentHandler {
  switch (agentType) {
    case "codex":
      return createCodexHandler(deps);
    case "gemini":
      return createGeminiHandler(deps);
    case "ollama": {
      const apiUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
      const model = process.env.OLLAMA_MODEL!;
      return createOllamaHandler({ apiUrl, model, toneStore: deps.toneStore });
    }
    case "claude":
    default:
      return createClaudeHandler(deps);
  }
}
