import type { createCalendarModeController } from "../calendar-mode.js";

export function createCalendarCommand(controller: ReturnType<typeof createCalendarModeController>) {
  return async function handle(args: string, channelId: string): Promise<string> {
    return controller.handleCommand(args, channelId);
  };
}
