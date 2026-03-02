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

  describe("tone command routing", () => {
    it("should route !tone command to onToneCommand when provided", async () => {
      // Given: a bot with onToneCommand handler
      const onToneCommand = vi.fn().mockReturnValue("Tone info");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> !tone casual",
      });

      // When: the handler processes a !tone message
      await handler(message);

      // Then: onToneCommand is called with args, onMessage is not called
      expect(onToneCommand).toHaveBeenCalledWith("casual");
      expect(onMessage).not.toHaveBeenCalled();
      expect(message.channel.send).toHaveBeenCalledWith("Tone info");
    });

    it("should route !tone without args to onToneCommand", async () => {
      // Given: a bot with onToneCommand handler
      const onToneCommand = vi.fn().mockReturnValue("Current tone: default");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> !tone",
      });

      // When: the handler processes a !tone message
      await handler(message);

      // Then: onToneCommand is called with empty string
      expect(onToneCommand).toHaveBeenCalledWith("");
      expect(onMessage).not.toHaveBeenCalled();
    });

    it("should route !tone set custom text to onToneCommand", async () => {
      // Given: a bot with onToneCommand handler
      const onToneCommand = vi.fn().mockReturnValue("Custom tone set.");
      createBot({ token: "test-token", onMessage, onToneCommand });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> !tone set Be a pirate",
      });

      // When: the handler processes the message
      await handler(message);

      // Then: onToneCommand receives the full args
      expect(onToneCommand).toHaveBeenCalledWith("set Be a pirate");
    });

    it("should fall through to onMessage when onToneCommand is not provided", async () => {
      // Given: a bot without onToneCommand handler
      createBot({ token: "test-token", onMessage });
      const handler = getMessageCreateHandler();
      const message = createMockMessage({
        content: "<@12345> !tone casual",
      });

      // When: the handler processes a !tone message
      await handler(message);

      // Then: onMessage is called with the full prompt
      expect(onMessage).toHaveBeenCalledWith("!tone casual", "channel-123");
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
});
