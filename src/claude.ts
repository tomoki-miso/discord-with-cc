import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { SessionStore } from "./history.js";
import type { ToneStore } from "./tone.js";
import { ALLOWED_TOOLS, DISALLOWED_TOOLS, MCP_SERVERS } from "./permissions.js";

const DISCORD_BOT_PROMPT = `You are running as a Discord bot. Important constraints:
- You have NO direct UI with the user. You cannot show prompts, dialogs, or permission requests.
- Your responses are sent as Discord messages. Keep them concise.
- You have access to MCP tools (apple-mcp, slack, etc.) that run on the host machine. Use them directly without asking the user for permission — the tools are already authorized.
- If a tool call fails, report the error honestly instead of claiming a prompt will appear.
- Always respond in Japanese unless the user writes in another language.`;

export type ClaudeHandlerConfig = {
  cwd: string;
  sessionStore: SessionStore;
  toneStore: ToneStore;
};

export type ClaudeHandler = {
  ask(prompt: string, channelId: string): Promise<string>;
};

export function createClaudeHandler(config: ClaudeHandlerConfig): ClaudeHandler {
  return {
    async ask(prompt: string, channelId: string): Promise<string> {
      try {
        return await executeQuery(config, prompt, channelId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    },
  };
}

async function executeQuery(
  config: ClaudeHandlerConfig,
  prompt: string,
  channelId: string,
): Promise<string> {
  const existingSession = config.sessionStore.get(channelId);

  const tonePrompt = config.toneStore.getSystemPrompt();

  const appendParts = [
    DISCORD_BOT_PROMPT,
    ...(tonePrompt ? [tonePrompt] : []),
  ];

  const options: Options = {
    cwd: config.cwd,
    allowedTools: [...ALLOWED_TOOLS],
    disallowedTools: [...DISALLOWED_TOOLS],
    mcpServers: MCP_SERVERS,
    ...(existingSession !== undefined ? { resume: existingSession } : {}),
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: appendParts.join("\n\n"),
    },
  };

  const stream = query({ prompt, options });

  let resultText = "";

  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") {
      config.sessionStore.set(channelId, message.session_id);
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        resultText = message.result;
      } else {
        resultText = `Error: ${message.errors.join(", ")}`;
      }
    }
  }

  return resultText;
}
