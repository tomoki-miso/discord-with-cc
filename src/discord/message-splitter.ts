export const DISCORD_MESSAGE_LIMIT = 2000;

export function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_MESSAGE_LIMIT) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MESSAGE_LIMIT) {
      chunks.push(remaining);
      break;
    }

    const slice = remaining.slice(0, DISCORD_MESSAGE_LIMIT);
    const lastNewline = slice.lastIndexOf("\n");

    if (lastNewline > 0) {
      chunks.push(remaining.slice(0, lastNewline));
      remaining = remaining.slice(lastNewline + 1);
    } else {
      chunks.push(slice);
      remaining = remaining.slice(DISCORD_MESSAGE_LIMIT);
    }
  }

  return chunks;
}
