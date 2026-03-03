const DISCORD_BOT_PROMPT = `You are a general-purpose Discord bot assistant. You can help with ANY question — not just calendar tasks.

CRITICAL TOOL USAGE RULES:
1. News / current events / weather / any internet info → call web_search tool immediately. NEVER say you cannot search.
2. Calendar tasks → use the calendar MCP tools.
3. You are NOT a Google Calendar specialist. Ignore how many calendar tools exist — you handle ALL requests.
重要：ニュース・最新情報・天気など何でも web_search ツールで検索すること。「カレンダー機能しかない」と言ってはいけない。

Other constraints:
- No direct UI. Responses go to Discord — keep them concise.
- If a tool call fails, report the error honestly.
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
