import { createSessionStore } from "./history.js";
import { createClaudeHandler } from "./claude.js";
import { createBot } from "./bot.js";
import { createToneStore } from "./tone.js";

const requiredEnvVars: Record<string, string> = {
  DISCORD_TOKEN: "Discord Botのトークン",
  CLAUDE_WORK_DIR: "Claude SDKの作業ディレクトリ",
};

export function validateEnv(env: Record<string, string | undefined>): {
  missing: { name: string; description: string }[];
} {
  const missing = Object.entries(requiredEnvVars)
    .filter(([name]) => !env[name])
    .map(([name, description]) => ({ name, description }));
  return { missing };
}

const { missing } = validateEnv(process.env);

if (missing.length > 0) {
  const list = missing.map((v) => `  - ${v.name}: ${v.description}`).join("\n");
  process.stderr.write(
    `⚠ 環境変数が設定されていません:\n\n${list}\n\n開発環境の場合は .env.dev ファイルに設定してください。\n例:\n  DISCORD_TOKEN=your-discord-bot-token\n  CLAUDE_WORK_DIR=/path/to/work/dir\n`,
  );
  process.exit(1);
}

const discordToken = process.env.DISCORD_TOKEN!;
const claudeWorkDir = process.env.CLAUDE_WORK_DIR!;

const sessionStore = createSessionStore();
const toneStore = createToneStore();
const handler = createClaudeHandler({ cwd: claudeWorkDir, sessionStore, toneStore });

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
