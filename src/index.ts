import { join } from "node:path";
import { createSessionStore } from "./history.js";
import { createClaudeHandler } from "./claude.js";
import { createCodexHandler } from "./codex.js";
import { createGeminiHandler } from "./gemini.js";
import { createBot } from "./bot.js";
import { createToneStore } from "./tone.js";
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

const sessionStore = createSessionStore();
const toneStore = createToneStore({ filePath: join(workDir, "tone.json") });
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
    case "claude":
    default:
      return createClaudeHandler(deps);
  }
}
