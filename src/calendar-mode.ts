import type { CalendarModeStore } from "./calendar-store.js";

export type CalendarModeController = {
  handleCommand(args: string, channelId: string): Promise<string>;
  handleNaturalLanguageInput(content: string, channelId: string): Promise<{ handled: boolean; response: string }>;
};

export type CalendarModeControllerOptions = {
  store: CalendarModeStore;
};

const HELP_TEXT = `!calendar on — このチャンネルでカレンダーモードを開始します。
!calendar off — カレンダーモードを終了します。
!calendar status — 現在の状態とデフォルト設定を表示します。
!calendar default <カレンダー名> — このチャンネルのデフォルトカレンダーを設定します。
!calendar default-global <カレンダー名> — 全チャンネル共通のデフォルトカレンダーを設定します。
!calendar clear-default — このチャンネルのデフォルト設定をクリアします。
!calendar help — このヘルプを表示します。

モード中は、ボットをメンションして自然言語で操作できます:
• 予定を追加: 「明日9時に会議」
• カレンダー一覧: 「カレンダーを見せて」
• 今日の予定: 「今日の予定を教えて」
• 予定を削除: 「明日の会議を削除して」
• 予定を変更: 「明日の会議を来週月曜に変更して」`;

export function createCalendarModeController(options: CalendarModeControllerOptions): CalendarModeController {
  return {
    async handleCommand(args: string, channelId: string): Promise<string> {
      const trimmed = args.trim();
      if (!trimmed) {
        return HELP_TEXT;
      }

      const [command, ...restTokens] = trimmed.split(/\s+/);
      const rest = restTokens.join(" ").trim();

      switch (command.toLowerCase()) {
        case "on":
        case "start":
          options.store.setActive(channelId, true);
          return "カレンダー追加モードを開始しました。このチャンネルでの通常メッセージは予定として解釈されます。";
        case "off":
        case "stop":
          options.store.setActive(channelId, false);
          return "カレンダー追加モードを終了しました。";
        case "status":
          return buildStatusMessage(options.store, channelId);
        case "default":
          if (!rest) {
            return "デフォルトカレンダー名を指定してください。例: !calendar default 自宅";
          }
          options.store.setChannelDefaultCalendar(channelId, rest);
          return `このチャンネルのデフォルトカレンダーを「${rest}」に設定しました。`;
        case "default-global":
          if (!rest) {
            return "全体デフォルトのカレンダー名を指定してください。";
          }
          options.store.setGlobalDefaultCalendar(rest);
          return `全チャンネル共通のデフォルトカレンダーを「${rest}」に設定しました。`;
        case "clear-default":
          options.store.clearChannelDefaultCalendar(channelId);
          return "このチャンネルのデフォルト設定をクリアしました。";
        case "help":
          return HELP_TEXT;
        default:
          return `不明なサブコマンドです: ${command}\n\n${HELP_TEXT}`;
      }
    },

    async handleNaturalLanguageInput(_content: string, channelId: string) {
      if (!options.store.isActive(channelId)) {
        return { handled: false, response: "" };
      }
      // カレンダーモードON → Claudeに処理させる（Typing indicatorのある onMessage パスへ落とす）
      return { handled: false, response: "" };
    },
  };
}

function buildStatusMessage(store: CalendarModeStore, channelId: string): string {
  const channelState = store.getChannelState(channelId);
  const globalDefault = store.getGlobalDefaultCalendar();
  const lines = [
    `モード: ${channelState.active ? "ON" : "OFF"}`,
    `チャンネルのデフォルト: ${channelState.defaultCalendar ?? "(未設定)"}`,
    `全体デフォルト: ${globalDefault ?? "(未設定)"}`,
    "ヘルプ: !calendar help",
  ];
  return lines.join("\n");
}
