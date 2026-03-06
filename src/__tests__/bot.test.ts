import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockOn, mockLogin, mockClientInstance, MockClient } = vi.hoisted(() => {
  const mockOn = vi.fn().mockReturnThis();
  const mockLogin = vi.fn().mockResolvedValue("token");
  const mockClientInstance = {
    on: mockOn,
    login: mockLogin,
    user: { id: "bot-user-id" },
  };
  const MockClient = vi.fn(() => mockClientInstance);
  return { mockOn, mockLogin, mockClientInstance, MockClient };
});

vi.mock("discord.js", () => ({
  Client: MockClient,
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 512,
    MessageContent: 32768,
  },
}));

import { createBot } from "../bot.js";
import { GatewayIntentBits } from "discord.js";

function getMessageCreateHandler(): (message: unknown) => Promise<void> {
  const call = mockOn.mock.calls.find(
    (args: unknown[]) => args[0] === "messageCreate",
  );
  if (!call) {
    throw new Error("messageCreate handler not registered");
  }
  return call[1] as (message: unknown) => Promise<void>;
}

function getInteractionCreateHandler(): (interaction: unknown) => void {
  const call = mockOn.mock.calls.find(
    (args: unknown[]) => args[0] === "interactionCreate",
  );
  if (!call) {
    throw new Error("interactionCreate handler not registered");
  }
  return call[1] as (interaction: unknown) => void;
}

function createMockMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { bot: false },
    mentions: {
      has: vi.fn().mockReturnValue(true),
    },
    content: "<@bot-user-id> hello world",
    channel: {
      send: vi.fn().mockResolvedValue(undefined),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      id: "channel-123",
    },
    ...overrides,
  };
}

function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    isChatInputCommand: vi.fn().mockReturnValue(true),
    commandName: "clear",
    channelId: "channel-123",
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getSubcommand: vi.fn().mockReturnValue("on"),
      getString: vi.fn().mockReturnValue(null),
    },
    ...overrides,
  };
}

describe("createBot", () => {
  let onMessage: ReturnType<typeof vi.fn<(content: string, channelId: string) => Promise<string>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnThis();
    mockLogin.mockResolvedValue("token");
    onMessage = vi.fn<(content: string, channelId: string) => Promise<string>>().mockResolvedValue("response text");
  });

  describe("initialization", () => {
    it("should create Client with required intents", () => {
      // Given: a bot configuration
      const config = { token: "test-token", onMessage };

      // When: creating the bot
      createBot(config);

      // Then: Client is constructed with Guilds, GuildMessages, MessageContent intents
      expect(MockClient).toHaveBeenCalledWith({
        intents: expect.arrayContaining([
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ]),
      });
    });

    it("should call login with provided token", () => {
      // Given: a bot configuration with a specific token
      const config = { token: "my-secret-token", onMessage };

      // When: creating the bot
      createBot(config);

      // Then: login is called with the token
      expect(mockLogin).toHaveBeenCalledWith("my-secret-token");
    });

    it("should register a messageCreate event handler", () => {
      // Given: a bot configuration
      const config = { token: "test-token", onMessage };

      // When: creating the bot
      createBot(config);

      // Then: a messageCreate handler is registered
      expect(mockOn).toHaveBeenCalledWith("messageCreate", expect.any(Function));
    });

    it("should register an interactionCreate event handler", () => {
      // Given: a bot configuration
      const config = { token: "test-token", onMessage };

      // When: creating the bot
      createBot(config);

      // Then: an interactionCreate handler is registered
      expect(mockOn).toHaveBeenCalledWith("interactionCreate", expect.any(Function));
    });
  });

  describe("message filtering", () => {
    it("should ignore messages from bots", async () => {
      // Given: a bot is created and receives a message from another bot
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const botMessage = createMockMessage({
        author: { bot: true },
      });

      // When: the handler processes the message
      await handler(botMessage);

      // Then: onMessage is not called
      expect(onMessage).not.toHaveBeenCalled();
    });

    it("should ignore messages without bot mention", async () => {
      // Given: a bot is created and receives a message without mention
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const noMentionMessage = createMockMessage({
        mentions: { has: vi.fn().mockReturnValue(false) },
        content: "hello world",
      });

      // When: the handler processes the message
      await handler(noMentionMessage);

      // Then: onMessage is not called
      expect(onMessage).not.toHaveBeenCalled();
    });

    it("should process messages without mention when channel is always-on", async () => {
      // Given: a bot with isAlwaysOnChannel returning true for the channel
      const isAlwaysOnChannel = vi.fn().mockReturnValue(true);
      createBot({ token: "test-token", onMessage, isAlwaysOnChannel });
      const handler = getMessageCreateHandler();
      const noMentionMessage = createMockMessage({
        mentions: { has: vi.fn().mockReturnValue(false) },
        content: "hello without mention",
      });

      // When: the handler processes the message
      await handler(noMentionMessage);

      // Then: onMessage is called with the full content (no mention stripping)
      expect(onMessage).toHaveBeenCalledWith("hello without mention", "channel-123");
    });

    it("should still ignore bot messages on always-on channels", async () => {
      // Given: a bot with always-on channel but message from a bot
      const isAlwaysOnChannel = vi.fn().mockReturnValue(true);
      createBot({ token: "test-token", onMessage, isAlwaysOnChannel });
      const handler = getMessageCreateHandler();
      const botMessage = createMockMessage({
        author: { bot: true },
        mentions: { has: vi.fn().mockReturnValue(false) },
        content: "bot message",
      });

      // When: the handler processes the message
      await handler(botMessage);

      // Then: onMessage is not called
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe("message processing", () => {
    it("should extract prompt by removing mention tags", async () => {
      // Given: a bot receives a mention message with mention tags
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> what is TypeScript?",
      });

      // When: the handler processes the message
      await handler(message);

      // Then: onMessage receives the cleaned prompt
      expect(onMessage).toHaveBeenCalledWith(
        "what is TypeScript?",
        "channel-123",
      );
    });

    it("should handle multiple mention tags in content", async () => {
      // Given: a message with multiple mention tags
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> <@!67890> explain this",
      });

      // When: the handler processes the message
      await handler(message);

      // Then: all mention tags are removed
      expect(onMessage).toHaveBeenCalledWith("explain this", "channel-123");
    });

    it("should call onMessage with channel ID", async () => {
      // Given: a bot receives a message in a specific channel
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        channel: {
          send: vi.fn().mockResolvedValue(undefined),
          sendTyping: vi.fn().mockResolvedValue(undefined),
          id: "specific-channel",
        },
      });

      // When: the handler processes the message
      await handler(message);

      // Then: onMessage receives the correct channel ID
      expect(onMessage).toHaveBeenCalledWith(
        expect.any(String),
        "specific-channel",
      );
    });

    it("should send response to the channel", async () => {
      // Given: a bot with onMessage that returns a response
      onMessage.mockResolvedValue("Here is my answer");
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When: the handler processes the message
      await handler(message);

      // Then: the response is sent to the channel
      expect(message.channel.send).toHaveBeenCalledWith("Here is my answer");
    });

    it("should send typing indicator while processing", async () => {
      // Given: a bot that takes time to process
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When: the handler processes the message
      await handler(message);

      // Then: sendTyping was called at least once
      expect(message.channel.sendTyping).toHaveBeenCalled();
    });
  });

  describe("message splitting", () => {
    it("should send single message when response is within 2000 chars", async () => {
      // Given: onMessage returns a short response
      const shortResponse = "a".repeat(2000);
      onMessage.mockResolvedValue(shortResponse);
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When: the handler processes the message
      await handler(message);

      // Then: exactly one message is sent
      expect(message.channel.send).toHaveBeenCalledTimes(1);
    });

    it("should split response into multiple messages when exceeding 2000 chars", async () => {
      // Given: onMessage returns a response longer than 2000 chars
      const longResponse = "a".repeat(4500);
      onMessage.mockResolvedValue(longResponse);
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When: the handler processes the message
      await handler(message);

      // Then: multiple messages are sent, each within 2000 chars
      expect(message.channel.send.mock.calls.length).toBeGreaterThan(1);
      for (const call of message.channel.send.mock.calls) {
        expect((call[0] as string).length).toBeLessThanOrEqual(2000);
      }
    });

    it("should split at newline boundary when available", async () => {
      // Given: onMessage returns a long response with a newline before the 2000 char limit
      const firstPart = "a".repeat(1990);
      const secondPart = "b".repeat(100);
      const longResponse = firstPart + "\n" + secondPart;
      onMessage.mockResolvedValue(longResponse);
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When: the handler processes the message
      await handler(message);

      // Then: the split occurs at the newline boundary
      expect(message.channel.send).toHaveBeenCalledTimes(2);
      expect(message.channel.send.mock.calls[0][0]).toBe(firstPart);
      expect(message.channel.send.mock.calls[1][0]).toBe(secondPart);
    });
  });

  describe("calendar mode interception", () => {
    it("should intercept natural language input when handler marks as handled", async () => {
      // Given: a bot with calendar input handler that claims the message
      const onCalendarInput = vi
        .fn()
        .mockResolvedValue({ handled: true, response: "Added" });
      createBot({ token: "test-token", onMessage, onCalendarInput });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> 明日9時に会議",
      });

      // When: the handler processes the message
      await handler(message);

      // Then: calendar handler processes it and onMessage is not called
      expect(onCalendarInput).toHaveBeenCalledWith("明日9時に会議", "channel-123");
      expect(onMessage).not.toHaveBeenCalled();
      expect(message.channel.send).toHaveBeenCalledWith("Added");
    });

    it("should fall through when calendar input handler returns handled: false", async () => {
      // Given: a handler that does not take ownership
      const onCalendarInput = vi
        .fn()
        .mockResolvedValue({ handled: false, response: "" });
      createBot({ token: "test-token", onMessage, onCalendarInput });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> 普通の質問",
      });

      // When: message is processed
      await handler(message);

      // Then: falls back to onMessage
      expect(onCalendarInput).toHaveBeenCalled();
      expect(onMessage).toHaveBeenCalledWith("普通の質問", "channel-123");
    });
  });

  describe("error handling", () => {
    it("should send error message to channel when onMessage rejects", async () => {
      // Given: onMessage that throws an error
      onMessage.mockRejectedValue(new Error("unexpected failure"));
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When: the handler processes the message
      await handler(message);

      // Then: an error message is sent to the channel
      expect(message.channel.send).toHaveBeenCalledWith(
        "An error occurred while processing your message.",
      );
    });

    it("should not throw when onMessage rejects", async () => {
      // Given: onMessage that throws an error
      onMessage.mockRejectedValue(new Error("unexpected failure"));
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage();

      // When/Then: the handler does not throw
      await expect(handler(message)).resolves.not.toThrow();
    });
  });

  describe("slash command handling", () => {
    it("should reply with clear confirmation for /clear command", async () => {
      // Given: a bot with onClearCommand
      const onClearCommand = vi.fn().mockReturnValue("このチャンネルのコンテキストをクリアしました。");
      createBot({ token: "test-token", onMessage, onClearCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({ commandName: "clear" });

      // When: a /clear interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: reply is sent with the response
      expect(onClearCommand).toHaveBeenCalledWith("channel-123");
      expect(interaction.reply).toHaveBeenCalledWith({ content: "このチャンネルのコンテキストをクリアしました。" });
    });

    it("should reply with fallback message when onClearCommand is not set", async () => {
      // Given: a bot without onClearCommand
      createBot({ token: "test-token", onMessage });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({ commandName: "clear" });

      // When: a /clear interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: fallback message is returned
      expect(interaction.reply).toHaveBeenCalledWith({ content: "clear コマンドは設定されていません。" });
    });

    it("should handle /tone show subcommand with empty args", async () => {
      // Given: a bot with onToneCommand
      const onToneCommand = vi.fn().mockReturnValue("現在のトーン: default");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "tone",
        options: {
          getSubcommand: vi.fn().mockReturnValue("show"),
          getString: vi.fn().mockReturnValue(null),
        },
      });

      // When: a /tone show interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onToneCommand called with empty args
      expect(onToneCommand).toHaveBeenCalledWith("");
      expect(interaction.reply).toHaveBeenCalledWith({ content: "現在のトーン: default" });
    });

    it("should handle /tone reset subcommand", async () => {
      // Given: a bot with onToneCommand
      const onToneCommand = vi.fn().mockReturnValue("デフォルトにリセットしました。");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "tone",
        options: {
          getSubcommand: vi.fn().mockReturnValue("reset"),
          getString: vi.fn().mockReturnValue(null),
        },
      });

      // When: a /tone reset interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onToneCommand called with "reset"
      expect(onToneCommand).toHaveBeenCalledWith("reset");
    });

    it("should handle /tone preset subcommand with name option", async () => {
      // Given: a bot with onToneCommand
      const onToneCommand = vi.fn().mockReturnValue("トーンを casual に変更しました。");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "tone",
        options: {
          getSubcommand: vi.fn().mockReturnValue("preset"),
          getString: vi.fn().mockReturnValue("casual"),
        },
      });

      // When: a /tone preset interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onToneCommand called with preset name
      expect(onToneCommand).toHaveBeenCalledWith("casual");
    });

    it("should handle /tone custom subcommand with text option", async () => {
      // Given: a bot with onToneCommand
      const onToneCommand = vi.fn().mockReturnValue("カスタムトーンを設定しました。");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "tone",
        options: {
          getSubcommand: vi.fn().mockReturnValue("custom"),
          getString: vi.fn((name: string) => name === "text" ? "海賊のように話してください" : null),
        },
      });

      // When: a /tone custom interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onToneCommand called with "set <text>"
      expect(onToneCommand).toHaveBeenCalledWith("set 海賊のように話してください");
    });

    it("should deferReply for /calendar command", async () => {
      // Given: a bot with onCalendarCommand
      const onCalendarCommand = vi.fn().mockResolvedValue("カレンダーモードを開始しました。");
      createBot({ token: "test-token", onMessage, onCalendarCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "calendar",
        options: {
          getSubcommand: vi.fn().mockReturnValue("on"),
          getString: vi.fn().mockReturnValue(null),
        },
      });

      // When: a /calendar on interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.deferReply).toHaveBeenCalled());

      // Then: deferReply is called first
      expect(interaction.deferReply).toHaveBeenCalled();
      await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalled());
      expect(onCalendarCommand).toHaveBeenCalledWith("on", "channel-123");
    });

    it("should pass default name arg for /calendar default", async () => {
      // Given: a bot with onCalendarCommand
      const onCalendarCommand = vi.fn().mockResolvedValue("デフォルトカレンダーを設定しました。");
      createBot({ token: "test-token", onMessage, onCalendarCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "calendar",
        options: {
          getSubcommand: vi.fn().mockReturnValue("default"),
          getString: vi.fn().mockReturnValue("仕事"),
        },
      });

      // When: a /calendar default interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(onCalendarCommand).toHaveBeenCalled());

      // Then: args include the calendar name
      expect(onCalendarCommand).toHaveBeenCalledWith("default 仕事", "channel-123");
    });

    it("should handle /channel on subcommand", async () => {
      // Given: a bot with onChannelCommand
      const onChannelCommand = vi.fn().mockReturnValue("常時応答モードに設定しました。");
      createBot({ token: "test-token", onMessage, onChannelCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "channel",
        options: {
          getSubcommand: vi.fn().mockReturnValue("on"),
          getString: vi.fn().mockReturnValue(null),
        },
      });

      // When: a /channel on interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onChannelCommand called with "on"
      expect(onChannelCommand).toHaveBeenCalledWith("on", "channel-123");
      expect(interaction.reply).toHaveBeenCalledWith({ content: "常時応答モードに設定しました。" });
    });

    it("should handle /schedule add subcommand", async () => {
      // Given: a bot with onScheduleCommand
      const onScheduleCommand = vi.fn().mockReturnValue("スケジュールを登録しました。");
      createBot({ token: "test-token", onMessage, onScheduleCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "schedule",
        options: {
          getSubcommand: vi.fn().mockReturnValue("add"),
          getString: vi.fn((name: string) => {
            if (name === "expression") return "毎朝9時";
            if (name === "prompt") return "天気を教えて";
            return null;
          }),
        },
      });

      // When: a /schedule add interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onScheduleCommand called with add sub and options
      expect(onScheduleCommand).toHaveBeenCalledWith(
        "add",
        { expression: "毎朝9時", prompt: "天気を教えて" },
        "channel-123",
      );
      expect(interaction.reply).toHaveBeenCalledWith({ content: "スケジュールを登録しました。" });
    });

    it("should handle /schedule list subcommand", async () => {
      // Given: a bot with onScheduleCommand
      const onScheduleCommand = vi.fn().mockReturnValue("スケジュール一覧");
      createBot({ token: "test-token", onMessage, onScheduleCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "schedule",
        options: {
          getSubcommand: vi.fn().mockReturnValue("list"),
          getString: vi.fn().mockReturnValue(null),
        },
      });

      // When: a /schedule list interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onScheduleCommand called with list sub and empty options
      expect(onScheduleCommand).toHaveBeenCalledWith("list", {}, "channel-123");
    });

    it("should handle /schedule delete subcommand", async () => {
      // Given: a bot with onScheduleCommand
      const onScheduleCommand = vi.fn().mockReturnValue("スケジュールを削除しました。");
      createBot({ token: "test-token", onMessage, onScheduleCommand });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "schedule",
        options: {
          getSubcommand: vi.fn().mockReturnValue("delete"),
          getString: vi.fn((name: string) => name === "id" ? "550e8400" : null),
        },
      });

      // When: a /schedule delete interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: onScheduleCommand called with delete sub and id
      expect(onScheduleCommand).toHaveBeenCalledWith("delete", { id: "550e8400" }, "channel-123");
    });

    it("should reply with fallback when onScheduleCommand is not set", async () => {
      // Given: a bot without onScheduleCommand
      createBot({ token: "test-token", onMessage });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        commandName: "schedule",
        options: {
          getSubcommand: vi.fn().mockReturnValue("list"),
          getString: vi.fn().mockReturnValue(null),
        },
      });

      // When: a /schedule interaction arrives
      interactionHandler(interaction);
      await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalled());

      // Then: fallback message is returned
      expect(interaction.reply).toHaveBeenCalledWith({ content: "schedule コマンドは設定されていません。" });
    });

    it("should ignore non-chat-input-command interactions", () => {
      // Given: a bot and a non-slash-command interaction
      createBot({ token: "test-token", onMessage });
      const interactionHandler = getInteractionCreateHandler();
      const interaction = createMockInteraction({
        isChatInputCommand: vi.fn().mockReturnValue(false),
      });

      // When: a non-command interaction arrives
      interactionHandler(interaction);

      // Then: reply is not called
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });
});
