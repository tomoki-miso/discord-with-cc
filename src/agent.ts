export const SUPPORTED_AGENTS = ["claude", "codex", "gemini"] as const;

export type AgentType = (typeof SUPPORTED_AGENTS)[number];

export const DEFAULT_AGENT: AgentType = "claude";

export type AgentHandler = {
  ask(prompt: string, channelId: string): Promise<string>;
};

function isAgent(value: string): value is AgentType {
  return (SUPPORTED_AGENTS as readonly string[]).includes(value);
}

export function normalizeAgentType(value: string | undefined): AgentType {
  if (!value) return DEFAULT_AGENT;
  const normalized = value.trim().toLowerCase();
  if (isAgent(normalized)) {
    return normalized;
  }
  return DEFAULT_AGENT;
}

export function formatSupportedAgents(): string {
  return SUPPORTED_AGENTS.join(", ");
}
