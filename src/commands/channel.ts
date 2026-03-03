import type { createChannelModeController } from "../channel-mode.js";

export function createChannelCommand(controller: ReturnType<typeof createChannelModeController>) {
  return function handle(args: string, channelId: string): string {
    return controller.handleCommand(args, channelId);
  };
}
