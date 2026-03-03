import type { CommandHandler } from "./types.js";

type SyncCommandHandler = (args: string, channelId: string) => string;
type AsyncCommandHandler = (args: string, channelId: string) => Promise<string>;
type CommandHandlerFn = SyncCommandHandler | AsyncCommandHandler;

export class CommandRouter {
  private handlers = new Map<string, CommandHandlerFn>();

  register(prefix: string, handler: CommandHandlerFn): void {
    this.handlers.set(prefix, handler);
  }

  /**
   * Attempt to handle a Discord message as a command.
   * Returns the response string if handled, or null if not a command.
   */
  async handle(prompt: string, channelId: string): Promise<string | null> {
    for (const [prefix, handler] of this.handlers) {
      if (prefix === prompt || prompt.startsWith(prefix + " ")) {
        const args = prompt === prefix ? "" : prompt.slice(prefix.length + 1);
        return await handler(args, channelId);
      }
      // Handle commands like "!clear" that match exactly
      if (prompt === prefix) {
        return await handler("", channelId);
      }
    }
    return null;
  }
}
