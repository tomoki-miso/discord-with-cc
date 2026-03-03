import type { ChannelModeStore } from "./channel-store.js";

export type ChannelModeController = {
  handleCommand(args: string, channelId: string): string;
};

export type ChannelModeControllerOptions = {
  store: ChannelModeStore;
};

const HELP_TEXT = `!channel on — このチャンネルを常時応答モードに設定します。
!channel off — 常時応答モードを解除します。
!channel status — 現在の状態を表示します。
!channel help — このヘルプを表示します。`;

export function createChannelModeController(options: ChannelModeControllerOptions): ChannelModeController {
  return {
    handleCommand(args: string, channelId: string): string {
      const trimmed = args.trim();
      if (!trimmed) {
        return HELP_TEXT;
      }

      switch (trimmed.toLowerCase()) {
        case "on":
          options.store.setAlwaysOn(channelId, true);
          return "このチャンネルを常時応答モードに設定しました。";
        case "off":
          options.store.setAlwaysOn(channelId, false);
          return "常時応答モードを解除しました。";
        case "status":
          return `常時応答モード: ${options.store.isAlwaysOn(channelId) ? "ON" : "OFF"}`;
        case "help":
          return HELP_TEXT;
        default:
          return `不明なサブコマンドです: ${trimmed}\n\n${HELP_TEXT}`;
      }
    },
  };
}
