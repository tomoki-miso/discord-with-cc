import { parseCalendarText, CalendarParseError } from "./calendar-parser.js";
import type { CalendarModeStore } from "./calendar-store.js";
import { createCalendarEvent, type CalendarEventRequest, CalendarEventError } from "./calendar-service.js";

export type CalendarModeController = {
  handleCommand(args: string, channelId: string): Promise<string>;
  handleNaturalLanguageInput(content: string, channelId: string): Promise<{ handled: boolean; response: string }>;
};

export type CalendarModeControllerOptions = {
  store: CalendarModeStore;
  now?: () => Date;
  createEvent?: (request: CalendarEventRequest) => Promise<{ uid: string }>;
};

const HELP_TEXT = `!calendar on — このチャンネルでカレンダー追加モードを開始します。
!calendar off — カレンダー追加モードを終了します。
!calendar status — 現在の状態とデフォルト設定を表示します。
!calendar default <カレンダー名> — このチャンネルのデフォルトカレンダーを設定します。
!calendar default-global <カレンダー名> — 全チャンネル共通のデフォルトカレンダーを設定します。
!calendar clear-default — このチャンネルのデフォルト設定をクリアします。
!calendar help — このヘルプを表示します。

モード中は、ボットをメンションして「明日9時に会議」など自然言語で予定を送ると自動登録されます。`;

export function createCalendarModeController(options: CalendarModeControllerOptions): CalendarModeController {
  const nowProvider = options.now ?? (() => new Date());
  const eventCreator = options.createEvent ?? ((request: CalendarEventRequest) => createCalendarEvent(request));

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

    async handleNaturalLanguageInput(content: string, channelId: string) {
      if (!options.store.isActive(channelId)) {
        return { handled: false, response: "" };
      }

      const calendarName = options.store.getEffectiveCalendar(channelId);
      if (!calendarName) {
        return {
          handled: true,
          response:
            "デフォルトのカレンダーが設定されていません。!calendar default <名前> で設定してください。",
        };
      }

      try {
        const parsed = parseCalendarText(content, nowProvider());
        const descriptionParts = [parsed.note, parsed.url].filter((v): v is string => Boolean(v && v.trim().length));
        const result = await eventCreator({
          title: parsed.title,
          calendarName,
          start: parsed.start,
          end: parsed.end,
          location: parsed.location,
          description: descriptionParts.length > 0 ? descriptionParts.join("\n") : undefined,
        });
        return {
          handled: true,
          response: buildSuccessMessage(parsed.start, parsed.end, parsed.title, calendarName, result.uid),
        };
      } catch (error: unknown) {
        if (error instanceof CalendarParseError) {
          return { handled: true, response: `日時を解釈できませんでした: ${error.message}` };
        }
        if (error instanceof CalendarEventError) {
          return { handled: true, response: `カレンダー登録に失敗しました: ${error.message}` };
        }
        return { handled: true, response: `予期しないエラーが発生しました: ${error instanceof Error ? error.message : String(error)}` };
      }
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

function buildSuccessMessage(
  start: Date,
  end: Date,
  title: string,
  calendarName: string,
  uid: string,
): string {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  let rangeText = "";
  if (typeof formatter.formatRange === "function") {
    try {
      rangeText = formatter.formatRange(start, end);
    } catch {
      rangeText = `${formatter.format(start)} 〜 ${formatter.format(end)}`;
    }
  } else {
    rangeText = `${formatter.format(start)} 〜 ${formatter.format(end)}`;
  }

  return `「${title}」を ${rangeText} にカレンダー「${calendarName}」へ登録しました。\nUID: ${uid}`;
}
