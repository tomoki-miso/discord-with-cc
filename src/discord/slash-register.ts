import { REST, Routes } from "discord.js";
import { SLASH_COMMAND_DEFINITIONS } from "./slash-commands.js";

export async function registerSlashCommands(
  token: string,
  clientId: string,
  guildId: string,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: SLASH_COMMAND_DEFINITIONS },
  );
}
