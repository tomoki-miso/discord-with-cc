import { join } from "node:path";
import { createSessionStore } from "./history.js";
import { createClaudeHandler } from "./claude.js";
import { createCodexHandler } from "./codex.js";
import { createGeminiHandler } from "./gemini.js";
import { createOllamaHandler } from "./ollama.js";
import { createOllamaToolManager } from "./ollama-tools.js";
import { MCP_SERVERS } from "./permissions.js";
import { createBot } from "./bot.js";
import { createToneStore } from "./tone.js";
import { createCalendarModeStore } from "./calendar-store.js";
import { createCalendarModeController } from "./calendar-mode.js";
import { createChannelModeStore } from "./channel-store.js";
import { createChannelModeController } from "./channel-mode.js";
import { normalizeAgentType, formatSupportedAgents, type AgentType, type AgentHandler } from "./agent.js";
import { config, parseOllamaOptions } from "./config.js";
import { createClearCommand } from "./commands/clear.js";
import { handleToneCommand as toneCommandHandler } from "./commands/tone.js";
import { registerSlashCommands } from "./discord/slash-register.js";

export { parseOllamaOptions };

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

  if (!env.DISCORD_CLIENT_ID) {
    missing.push({ name: "DISCORD_CLIENT_ID", description: "Discord Bot の Application ID" });
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
    `⚠ 環境変数が設定されていません:\n\n${list}\n\n開発環境の場合は .env.dev ファイルに設定してください。\n例:\n  DISCORD_TOKEN=your-discord-bot-token\n  DISCORD_CLIENT_ID=your-application-id\n  AGENT_WORK_DIR=/path/to/work/dir\n  AGENT_TYPE=claude  # 利用可能: ${formatSupportedAgents()}\n`,
  );
  process.exit(1);
}

const discordToken = process.env.DISCORD_TOKEN!;
const workDir = resolveWorkDir(process.env)!;
const agentType = normalizeAgentType(process.env.AGENT_TYPE);

const agentLabel = (() => {
  switch (agentType) {
    case "ollama":
      return `ollama (${config.ollama.model})`;
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

// Re-export handleToneCommand for backward compatibility (tested by index.test.ts)
export function handleToneCommand(
  args: string,
  deps: { toneStore: ReturnType<typeof createToneStore>; sessionStore: ReturnType<typeof createSessionStore> },
): string {
  return toneCommandHandler(args, deps);
}

async function main() {
  const guildId = config.discord.guildId;
  if (guildId) {
    process.stderr.write("スラッシュコマンドを登録中...\n");
    await registerSlashCommands(config.discord.token, config.discord.clientId, guildId);
    process.stderr.write("スラッシュコマンド登録完了\n");
  } else {
    process.stderr.write("DISCORD_GUILD_ID 未設定: スラッシュコマンド登録をスキップ\n");
  }

  createBot({
    token: discordToken,
    onMessage: (prompt, channelId) => {
      if (calendarStore.isActive(channelId)) {
        const effectiveCalendar = calendarStore.getEffectiveCalendar(channelId);
        const calendarContext = [
          "[カレンダーモード有効: カレンダー操作が必要なときだけツールを使ってください。それ以外の質問には通常通り答えてください。]",
          effectiveCalendar ? `デフォルトカレンダー：「${effectiveCalendar}」` : null,
          "mcp__apple-mcpのカレンダーツールを活用してください。",
          "",
        ]
          .filter(Boolean)
          .join("\n");
        return handler.ask(`${calendarContext}\n${prompt}`, channelId);
      }
      return handler.ask(prompt, channelId);
    },
    onToneCommand: (args) => toneCommandHandler(args, { toneStore, sessionStore }),
    onCalendarCommand: (args, channelId) => calendarController.handleCommand(args, channelId),
    onCalendarInput: (content, channelId) => calendarController.handleNaturalLanguageInput(content, channelId),
    onChannelCommand: (args, channelId) => channelController.handleCommand(args, channelId),
    onClearCommand: (channelId) => {
      const clearFn = createClearCommand(handler);
      return clearFn("", channelId);
    },
    isAlwaysOnChannel: (channelId) => channelStore.isAlwaysOn(channelId),
  });
}

main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });

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
      const toolManager = createOllamaToolManager({ mcpServers: MCP_SERVERS, cwd: deps.cwd });
      return createOllamaHandler({
        apiUrl: config.ollama.apiUrl,
        model: config.ollama.model,
        toneStore: deps.toneStore,
        toolManager,
        options: config.ollama.options,
      });
    }
    case "claude":
    default:
      return createClaudeHandler(deps);
  }
}
