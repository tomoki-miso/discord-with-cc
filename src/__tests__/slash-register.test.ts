import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPut, MockREST, mockApplicationGuildCommands } = vi.hoisted(() => {
  const mockPut = vi.fn().mockResolvedValue([]);
  const MockREST = vi.fn(() => ({
    setToken: vi.fn().mockReturnThis(),
    put: mockPut,
  }));
  const mockApplicationGuildCommands = vi.fn().mockReturnValue("/applications/client/guilds/guild/commands");
  return { mockPut, MockREST, mockApplicationGuildCommands };
});

vi.mock("discord.js", () => ({
  REST: MockREST,
  Routes: {
    applicationGuildCommands: mockApplicationGuildCommands,
  },
  SlashCommandBuilder: vi.fn(() => ({
    setName: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    addSubcommand: vi.fn().mockReturnThis(),
    addStringOption: vi.fn().mockReturnThis(),
    toJSON: vi.fn().mockReturnValue({}),
  })),
}));

import { registerSlashCommands } from "../discord/slash-register.js";

describe("registerSlashCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue([]);
    MockREST.mockImplementation(() => ({
      setToken: vi.fn().mockReturnThis(),
      put: mockPut,
    }));
  });

  it("should create REST client with version 10 and provided token", async () => {
    // Given: valid credentials
    const token = "test-token";
    const clientId = "client-123";
    const guildId = "guild-456";

    // When: registering slash commands
    await registerSlashCommands(token, clientId, guildId);

    // Then: REST is instantiated with version 10
    expect(MockREST).toHaveBeenCalledWith({ version: "10" });
  });

  it("should call applicationGuildCommands route with clientId and guildId", async () => {
    // Given: valid credentials
    const token = "test-token";
    const clientId = "client-123";
    const guildId = "guild-456";

    // When: registering slash commands
    await registerSlashCommands(token, clientId, guildId);

    // Then: correct route is used
    expect(mockApplicationGuildCommands).toHaveBeenCalledWith(clientId, guildId);
  });

  it("should PUT slash command definitions to the route", async () => {
    // Given: valid credentials
    const token = "test-token";
    const clientId = "client-123";
    const guildId = "guild-456";
    const expectedRoute = "/applications/client/guilds/guild/commands";

    // When: registering slash commands
    await registerSlashCommands(token, clientId, guildId);

    // Then: PUT is called with the correct route and body
    expect(mockPut).toHaveBeenCalledWith(
      expectedRoute,
      expect.objectContaining({ body: expect.any(Array) }),
    );
  });

  it("should propagate errors from the REST PUT call", async () => {
    // Given: REST PUT throws an error
    const putError = new Error("API error");
    mockPut.mockRejectedValue(putError);

    // When/Then: registerSlashCommands rejects with the same error
    await expect(
      registerSlashCommands("token", "client", "guild"),
    ).rejects.toThrow("API error");
  });
});
