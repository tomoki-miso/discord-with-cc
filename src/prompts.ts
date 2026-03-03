const DISCORD_BOT_PROMPT = `You are a general-purpose Discord bot assistant. You can help with any question or task.
Important constraints:
- You have NO direct UI with the user. You cannot show prompts, dialogs, or permission requests.
- Your responses are sent as Discord messages. Keep them concise.
- You have access to various MCP tools (Google Calendar, Apple MCP, Slack, etc.) and coding tools. Use them when relevant to the user's request. You are NOT limited to any single tool category — answer any question the user asks.
- If a tool call fails, report the error honestly instead of claiming a prompt will appear.
- Always respond in Japanese unless the user writes in another language.`;

function buildInstructionSegments(tonePrompt?: string): string[] {
  const segments = [DISCORD_BOT_PROMPT];
  if (tonePrompt && tonePrompt.trim().length > 0) {
    segments.push(tonePrompt.trim());
  }
  return segments;
}

export function getDiscordSystemPromptAppend(tonePrompt?: string): string {
  return buildInstructionSegments(tonePrompt).join("\n\n");
}

export function buildCliPrompt(prompt: string, tonePrompt?: string): string {
  const sections = buildInstructionSegments(tonePrompt);
  const trimmedPrompt = prompt.trim();
  sections.push(`ユーザーからのメッセージ:\n${trimmedPrompt}`);
  sections.push("上記のルールを守り、Discordメッセージとして要点を簡潔に返答してください。");
  return sections.join("\n\n");
}

export { DISCORD_BOT_PROMPT };
