import { createSessionStore } from "./history.js";
import { createClaudeHandler } from "./claude.js";
import { createBot } from "./bot.js";

const discordToken = process.env.DISCORD_TOKEN;
const claudeWorkDir = process.env.CLAUDE_WORK_DIR;

if (!discordToken) {
  process.stderr.write("DISCORD_TOKEN is not set\n");
  process.exit(1);
}

if (!claudeWorkDir) {
  process.stderr.write("CLAUDE_WORK_DIR is not set\n");
  process.exit(1);
}

const sessionStore = createSessionStore();
const handler = createClaudeHandler({ cwd: claudeWorkDir, sessionStore });

createBot({
  token: discordToken,
  onMessage: (prompt, channelId) => handler.ask(prompt, channelId),
});
