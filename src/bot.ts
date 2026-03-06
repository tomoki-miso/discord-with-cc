import { Client, GatewayIntentBits } from "discord.js";
import type { Message, TextChannel, ChatInputCommandInteraction } from "discord.js";
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
  onScheduleCommand?: (
    sub: string,
    options: { expression?: string; prompt?: string; id?: string },
    channelId: string,
  ) => string;
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

  client.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    handleSlashCommand(config, interaction as ChatInputCommandInteraction).catch((err) => {
      process.stderr.write(`Error handling slash command: ${err instanceof Error ? err.message : String(err)}\n`);
    });
  });

  client.login(config.token);

  return client;
}

async function handleSlashCommand(
  config: BotConfig,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { commandName, channelId } = interaction;

  if (commandName === "clear") {
    const response = config.onClearCommand?.(channelId) ?? "clear コマンドは設定されていません。";
    await interaction.reply({ content: response });
    return;
  }

  if (commandName === "tone") {
    if (!config.onToneCommand) {
      await interaction.reply({ content: "tone コマンドは設定されていません。", ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    let args = "";
    if (sub === "reset") args = "reset";
    else if (sub === "preset") args = interaction.options.getString("name", true);
    else if (sub === "custom") args = `set ${interaction.options.getString("text", true)}`;
    // sub === "show" → args = "" (default)
    await interaction.reply({ content: config.onToneCommand(args) });
    return;
  }

  if (commandName === "calendar") {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    let args = sub;
    if (sub === "default" || sub === "default-global") {
      args = `${sub} ${interaction.options.getString("name", true)}`;
    }
    try {
      const response = await config.onCalendarCommand?.(args, channelId) ?? "";
      if (response.trim().length > 0) await interaction.editReply({ content: response });
      else await interaction.deleteReply();
    } catch {
      await interaction.editReply({ content: "カレンダーコマンドの処理中にエラーが発生しました。" });
    }
    return;
  }

  if (commandName === "channel") {
    const sub = interaction.options.getSubcommand();
    const response = config.onChannelCommand?.(sub, channelId) ?? "channel コマンドは設定されていません。";
    await interaction.reply({ content: response });
    return;
  }

  if (commandName === "schedule") {
    const sub = interaction.options.getSubcommand();
    const opts: { expression?: string; prompt?: string; id?: string } = {};
    if (sub === "add") {
      opts.expression = interaction.options.getString("expression", true);
      opts.prompt = interaction.options.getString("prompt", true);
    } else if (sub === "delete") {
      opts.id = interaction.options.getString("id", true);
    }
    const response = config.onScheduleCommand?.(sub, opts, channelId) ?? "schedule コマンドは設定されていません。";
    await interaction.reply({ content: response });
    return;
  }
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

  if (config.onCalendarInput) {
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
        .send("カレンダー処理中にエラーが発生しました。/calendar help で使い方を確認してください。")
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
