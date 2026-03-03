import type { AgentHandler } from "../agent.js";

export function createClearCommand(agentHandler: AgentHandler) {
  return function handle(_args: string, channelId: string): string {
    agentHandler.clearHistory?.(channelId);
    return "このチャンネルのコンテキストをクリアしました。";
  };
}
