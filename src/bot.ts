import { Client, GatewayIntentBits } from "discord.js";
import type { Message, TextChannel } from "discord.js";
import { splitMessage } from "./discord/message-splitter.js";

const TYPING_INTERVAL_MS = 5000;

export type BotConfig = {
  token: string;
  onMessage: (content: string, channelId: string) => Promise<string>;
  onToneCommand?: (args: string) => string;
  onCalendarCommand?: (args: string, channelId: string) => Promise<string>;
  onCalendarInput?: (content: string, channelId: string) => Promise<{ handled: boolean; response: string }>;
  onChannelCommand?: (args: string, channelId: string) => string;
  onClearCommand?: (channelId: string) => string;
  isAlwaysOnChannel?: (channelId: string) => boolean;
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
    handleMessage(client, config, message),
  );

  client.login(config.token);

  return client;
}

async function handleMessage(
  client: Client,
  config: BotConfig,
  message: Message,
): Promise<void> {
  if (message.author.bot) return;
  const channel = message.channel as TextChannel;
  const isMentioned = client.user != null && message.mentions.has(client.user);
  const isAlwaysOn = config.isAlwaysOnChannel?.(channel.id) ?? false;
  if (!isMentioned && !isAlwaysOn) return;
  const prompt = isMentioned
    ? message.content.replace(/<@!?\d+>/g, "").trim()
    : message.content.trim();

  if (prompt.startsWith("!tone") && config.onToneCommand) {
    const args = prompt.slice("!tone".length).trim();
    const response = config.onToneCommand(args);
    await channel.send(response);
    return;
  }

  if (prompt.startsWith("!channel") && config.onChannelCommand) {
    const args = prompt.slice("!channel".length).trim();
    const response = config.onChannelCommand(args, channel.id);
    await channel.send(response);
    return;
  }

  if (prompt === "!clear" && config.onClearCommand) {
    const response = config.onClearCommand(channel.id);
    await channel.send(response);
    return;
  }

  if (prompt.startsWith("!calendar") && config.onCalendarCommand) {
    const args = prompt.slice("!calendar".length).trim();
    try {
      const response = await config.onCalendarCommand(args, channel.id);
      if (response.trim().length > 0) {
        await channel.send(response);
      }
    } catch (error: unknown) {
      process.stderr.write(
        `Error handling calendar command: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      await channel.send("カレンダーコマンドの処理中にエラーが発生しました。").catch(() => {});
    }
    return;
  }

  if (!prompt.startsWith("!") && config.onCalendarInput) {
    try {
      const calendarResult = await config.onCalendarInput(prompt, channel.id);
      if (calendarResult.handled) {
        if (calendarResult.response.trim().length > 0) {
          await channel.send(calendarResult.response);
        }
        return;
      }
    } catch (error: unknown) {
      process.stderr.write(
        `Error handling calendar input: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      await channel
        .send("カレンダー処理中にエラーが発生しました。!calendar help で使い方を確認してください。")
        .catch(() => {});
      return;
    }
  }

  const typingInterval = setInterval(() => {
    channel.sendTyping().catch(() => {});
  }, TYPING_INTERVAL_MS);

  try {
    channel.sendTyping().catch(() => {});
    const response = await config.onMessage(prompt, channel.id);
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

