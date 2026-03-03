export type CommandHandler = {
  handle(args: string, channelId: string): Promise<string> | string;
};
