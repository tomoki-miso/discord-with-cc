import { Client, GatewayIntentBits } from "discord.js";
import type { Message, TextChannel } from "discord.js";

const DISCORD_MESSAGE_LIMIT = 2000;
const TYPING_INTERVAL_MS = 5000;

export type BotConfig = {
  token: string;
  onMessage: (content: string, channelId: string) => Promise<string>;
};

export function createBot(config: BotConfig): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("messageCreate", (message: Message) =>
    handleMessage(client, config.onMessage, message),
  );

  client.login(config.token);

  return client;
}

async function handleMessage(
  client: Client,
  onMessage: BotConfig["onMessage"],
  message: Message,
): Promise<void> {
  if (message.author.bot) return;
  if (!client.user || !message.mentions.has(client.user)) return;

  const prompt = message.content.replace(/<@!?\d+>/g, "").trim();
  const channel = message.channel as TextChannel;

  const typingInterval = setInterval(() => {
    channel.sendTyping().catch(() => {});
  }, TYPING_INTERVAL_MS);

  try {
    channel.sendTyping().catch(() => {});
    const response = await onMessage(prompt, channel.id);
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  } catch (error: unknown) {
    process.stderr.write(
      `Error handling message: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    await channel.send("An error occurred while processing your message.").catch(() => {});
  } finally {
    clearInterval(typingInterval);
  }
}

function splitMessage(text: string): string[] {
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
