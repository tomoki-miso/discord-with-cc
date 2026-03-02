import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { SessionStore } from "./history.js";
import { ALLOWED_TOOLS, DISALLOWED_TOOLS, MCP_SERVERS } from "./permissions.js";

export type ClaudeHandlerConfig = {
  cwd: string;
  sessionStore: SessionStore;
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

  const options: Options = {
    cwd: config.cwd,
    allowedTools: [...ALLOWED_TOOLS],
    disallowedTools: [...DISALLOWED_TOOLS],
    mcpServers: MCP_SERVERS,
    ...(existingSession !== undefined ? { resume: existingSession } : {}),
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
