import { parseCalendarText, CalendarParseError } from "./calendar-parser.js";
import type { CalendarModeStore } from "./calendar-store.js";
import {
  createCalendarEvent,
  listCalendars,
  listEvents,
  deleteEvent,
  updateEvent,
  type CalendarEventRequest,
  CalendarEventError,
  type EventSummary,
  type EventUpdate,
} from "./calendar-service.js";
import type { PendingOperation } from "./calendar-store.js";
import * as chrono from "chrono-node";

export type CalendarModeController = {
  handleCommand(args: string, channelId: string): Promise<string>;
  handleNaturalLanguageInput(content: string, channelId: string): Promise<{ handled: boolean; response: string }>;
};

export type CalendarModeControllerOptions = {
  store: CalendarModeStore;
  now?: () => Date;
  createEvent?: (request: CalendarEventRequest) => Promise<{ uid: string }>;
  listCalendarsImpl?: () => Promise<string[]>;
  listEventsImpl?: (calendarName: string | null, start: Date, end: Date) => Promise<EventSummary[]>;
  deleteEventImpl?: (calendarName: string, uid: string) => Promise<void>;
  updateEventImpl?: (calendarName: string, uid: string, updates: EventUpdate) => Promise<void>;
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

export function detectIntent(text: string, _now: Date): "list_calendars" | "list_events" | "delete" | "update" | "create" {
  if (/カレンダー.*(一覧|見せ|表示|リスト|教え)|(list|show)\s+calendars?/i.test(text)) {
    return "list_calendars";
  }
  // delete/update must be checked before list_events to handle "予定を来週に移動して" correctly
  if (/削除|消|キャンセル|取り消|(delete|remove|cancel)\s+/i.test(text)) {
    return "delete";
  }
  if (/変更|修正|移動|ずら|更新|リスケ|(change|update|move|reschedule|edit)\s+/i.test(text)) {
    return "update";
  }
  if (
    /(予定|スケジュール|イベント).*(一覧|見せ|確認|教え)|(今日|明日|今週|来週|今月|来月).*(予定|スケジュール)|(予定|スケジュール).*(今日|明日|今週|来週|今月|来月)/i.test(text)
  ) {
    return "list_events";
  }
  return "create";
}

export function extractSearchQuery(text: string): string {
  const matchBefore = text.match(/(.+?)(?:を|の)(?:削除|消|キャンセル|変更|修正|移動|ずら|更新|リスケ)/u);
  if (matchBefore) {
    return matchBefore[1].trim();
  }
  // Fallback: strip common operation keywords and return the rest
  return text
    .replace(/削除|消|キャンセル|取り消|変更|修正|移動|ずら|更新|リスケ|して|ください|よ|ね/g, "")
    .replace(/(delete|remove|cancel|change|update|move|reschedule|edit)\s*/gi, "")
    .trim();
}

/** Removes temporal/generic scheduling words from a query for title-based filtering. Returns "" when nothing meaningful remains. */
function cleanQueryForTitleFilter(query: string): string {
  const stripped = query
    .replace(/今日|明日|今週|来週|今月|来月|昨日|先週|先月/g, "")
    .replace(/\s*の\s*/g, "")
    .trim();
  // If only generic scheduling words remain, don't filter by title
  if (!stripped || /^(予定|スケジュール|イベント)+$/.test(stripped)) return "";
  return stripped;
}

export function extractUpdateDetails(text: string, now: Date): Partial<EventUpdate> {
  const result: Partial<EventUpdate> = {};

  // Title change: タイトル(を|は)(.+?)(に|へ)(変更|修正)
  const titleMatch = text.match(/タイトル(?:を|は)(.+?)(?:に|へ)(?:変更|修正)/u);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Date/time: prefer second parsed result (the target date) over first
  const parsed = chrono.ja.parse(text, now, { forwardDate: true });
  if (parsed.length >= 2) {
    const target = parsed[parsed.length - 1];
    result.start = target.start.date();
    result.end = target.end ? target.end.date() : new Date(result.start.getTime() + 60 * 60 * 1000);
  } else if (parsed.length === 1) {
    result.start = parsed[0].start.date();
    result.end = parsed[0].end ? parsed[0].end.date() : new Date(result.start.getTime() + 60 * 60 * 1000);
  }

  return result;
}

export function extractSearchTimeRange(text: string, now: Date): { start: Date; end: Date } {
  const startOfDay = (d: Date): Date => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  };
  const endOfDay = (d: Date): Date => {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r;
  };
  const startOfWeek = (d: Date): Date => {
    const r = new Date(d);
    r.setDate(r.getDate() - r.getDay());
    r.setHours(0, 0, 0, 0);
    return r;
  };
  const endOfWeek = (d: Date): Date => {
    const r = startOfWeek(d);
    r.setDate(r.getDate() + 6);
    r.setHours(23, 59, 59, 999);
    return r;
  };
  const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

  if (/今日/.test(text)) {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (/明日/.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: startOfDay(tomorrow), end: endOfDay(tomorrow) };
  }
  if (/来週/.test(text)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return { start: startOfWeek(nextWeek), end: endOfWeek(nextWeek) };
  }
  if (/今週/.test(text)) {
    return { start: startOfWeek(now), end: endOfWeek(now) };
  }
  if (/来月/.test(text)) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: startOfMonth(nextMonth), end: endOfMonth(nextMonth) };
  }
  if (/今月/.test(text)) {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }

  // Try chrono-node
  const parsed = chrono.ja.parse(text, now, { forwardDate: true });
  if (parsed.length > 0) {
    const best = parsed[0];
    const s = best.start.date();
    const e = best.end ? best.end.date() : endOfDay(s);
    return { start: startOfDay(s), end: endOfDay(e) };
  }

  // Fallback: today
  return { start: startOfDay(now), end: endOfDay(now) };
}

/** Returns true when the message looks like a general question rather than a calendar operation. */
function isGeneralQuestion(text: string): boolean {
  const trimmed = text.trim();
  return /(?:教えて(?:ください)?|ですか|ますか|でしょうか)[。]?$/.test(trimmed) || /[?？]\s*$/.test(trimmed);
}

function formatEventList(events: EventSummary[]): string {
  const formatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
  return events
    .map((e, i) => `${i + 1}. 【${e.calendarName}】${e.title} (${formatter.format(e.start)})`)
    .join("\n");
}

export function createCalendarModeController(options: CalendarModeControllerOptions): CalendarModeController {
  const nowProvider = options.now ?? (() => new Date());
  const eventCreator = options.createEvent ?? ((request: CalendarEventRequest) => createCalendarEvent(request));
  const calendarLister = options.listCalendarsImpl ?? listCalendars;
  const eventsLister = options.listEventsImpl ?? listEvents;
  const eventDeleter = options.deleteEventImpl ?? deleteEvent;
  const eventUpdater = options.updateEventImpl ?? updateEvent;

  async function handlePendingStep(
    pending: PendingOperation,
    content: string,
    channelId: string,
  ): Promise<{ handled: boolean; response: string }> {
    const trimmed = content.trim();

    if (pending.type === "select_candidate") {
      if (/キャンセル|やめ|中止|no|n$/i.test(trimmed)) {
        options.store.clearPendingOperation(channelId);
        return { handled: true, response: "操作をキャンセルしました。" };
      }
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num < 1 || num > pending.candidates.length) {
        return {
          handled: true,
          response: `1〜${pending.candidates.length} の番号を入力してください（キャンセルする場合は「キャンセル」）:\n${formatEventList(pending.candidates)}`,
        };
      }
      const selected = pending.candidates[num - 1];
      if (pending.opType === "delete") {
        options.store.setPendingOperation(channelId, { type: "confirm_delete", selectedEvent: selected });
        const formatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
        return {
          handled: true,
          response: `「${selected.title}」(${formatter.format(selected.start)}) を削除しますか？ (yes/no)`,
        };
      } else {
        const updateData = pending.updateData ?? {};
        options.store.setPendingOperation(channelId, { type: "confirm_update", selectedEvent: selected, updateData });
        const formatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
        const changes: string[] = [];
        if (updateData.title) changes.push(`タイトル: ${updateData.title}`);
        if (updateData.start) changes.push(`開始: ${formatter.format(updateData.start)}`);
        if (updateData.end) changes.push(`終了: ${formatter.format(updateData.end)}`);
        return {
          handled: true,
          response: `「${selected.title}」を以下の内容に更新しますか？\n${changes.join("\n")}\n(yes/no)`,
        };
      }
    }

    if (pending.type === "confirm_delete") {
      if (/^(yes|y|はい|ok|削除|する)$/i.test(trimmed)) {
        await eventDeleter(pending.selectedEvent.calendarName, pending.selectedEvent.uid);
        options.store.clearPendingOperation(channelId);
        return { handled: true, response: `「${pending.selectedEvent.title}」を削除しました。` };
      } else {
        options.store.clearPendingOperation(channelId);
        return { handled: true, response: "削除をキャンセルしました。" };
      }
    }

    if (pending.type === "confirm_update") {
      if (/^(yes|y|はい|ok|更新|変更|する)$/i.test(trimmed)) {
        await eventUpdater(pending.selectedEvent.calendarName, pending.selectedEvent.uid, pending.updateData);
        options.store.clearPendingOperation(channelId);
        return { handled: true, response: `「${pending.selectedEvent.title}」を更新しました。` };
      } else {
        options.store.clearPendingOperation(channelId);
        return { handled: true, response: "更新をキャンセルしました。" };
      }
    }

    return { handled: false, response: "" };
  }

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

      const now = nowProvider();

      // Handle pending multi-step operation
      const pending = options.store.getPendingOperation(channelId);
      if (pending) {
        return handlePendingStep(pending, content, channelId);
      }

      const intent = detectIntent(content, now);

      if (intent === "list_calendars") {
        try {
          const calendars = await calendarLister();
          if (calendars.length === 0) {
            return { handled: true, response: "カレンダーが見つかりませんでした。" };
          }
          return { handled: true, response: `カレンダー一覧:\n${calendars.map((c, i) => `${i + 1}. ${c}`).join("\n")}` };
        } catch (error: unknown) {
          return { handled: true, response: `カレンダー一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}` };
        }
      }

      if (intent === "list_events") {
        const calendarName = options.store.getEffectiveCalendar(channelId) ?? null;
        const range = extractSearchTimeRange(content, now);
        try {
          const events = await eventsLister(calendarName, range.start, range.end);
          if (events.length === 0) {
            return { handled: true, response: "この期間の予定は見つかりませんでした。" };
          }
          return { handled: true, response: `予定一覧:\n${formatEventList(events)}` };
        } catch (error: unknown) {
          return { handled: true, response: `予定一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}` };
        }
      }

      if (intent === "delete") {
        const calendarName = options.store.getEffectiveCalendar(channelId) ?? null;
        const query = cleanQueryForTitleFilter(extractSearchQuery(content));
        const range = extractSearchTimeRange(content, now);
        try {
          const events = await eventsLister(calendarName, range.start, range.end);
          const filtered = query
            ? events.filter((e) => e.title.includes(query) || query.includes(e.title) || query.split(/\s+/).some((q) => e.title.includes(q)))
            : events;
          if (filtered.length === 0) {
            return { handled: true, response: "該当する予定が見つかりませんでした。" };
          }
          if (filtered.length === 1) {
            const formatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
            options.store.setPendingOperation(channelId, { type: "confirm_delete", selectedEvent: filtered[0] });
            return {
              handled: true,
              response: `「${filtered[0].title}」(${formatter.format(filtered[0].start)}) を削除しますか？ (yes/no)`,
            };
          }
          options.store.setPendingOperation(channelId, { type: "select_candidate", opType: "delete", candidates: filtered });
          return {
            handled: true,
            response: `該当する予定が複数見つかりました。番号を選択してください:\n${formatEventList(filtered)}`,
          };
        } catch (error: unknown) {
          return { handled: true, response: `予定の検索に失敗しました: ${error instanceof Error ? error.message : String(error)}` };
        }
      }

      if (intent === "update") {
        const calendarName = options.store.getEffectiveCalendar(channelId) ?? null;
        const query = cleanQueryForTitleFilter(extractSearchQuery(content));
        const range = extractSearchTimeRange(content, now);
        const updateData = extractUpdateDetails(content, now);
        try {
          const events = await eventsLister(calendarName, range.start, range.end);
          const filtered = query
            ? events.filter((e) => e.title.includes(query) || query.includes(e.title) || query.split(/\s+/).some((q) => e.title.includes(q)))
            : events;
          if (filtered.length === 0) {
            return { handled: true, response: "該当する予定が見つかりませんでした。" };
          }
          if (filtered.length === 1) {
            const formatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
            options.store.setPendingOperation(channelId, { type: "confirm_update", selectedEvent: filtered[0], updateData });
            const changes: string[] = [];
            if (updateData.title) changes.push(`タイトル: ${updateData.title}`);
            if (updateData.start) changes.push(`開始: ${formatter.format(updateData.start)}`);
            if (updateData.end) changes.push(`終了: ${formatter.format(updateData.end)}`);
            return {
              handled: true,
              response: `「${filtered[0].title}」を以下の内容に更新しますか？\n${changes.join("\n")}\n(yes/no)`,
            };
          }
          options.store.setPendingOperation(channelId, { type: "select_candidate", opType: "update", candidates: filtered, updateData });
          return {
            handled: true,
            response: `該当する予定が複数見つかりました。番号を選択してください:\n${formatEventList(filtered)}`,
          };
        } catch (error: unknown) {
          return { handled: true, response: `予定の検索に失敗しました: ${error instanceof Error ? error.message : String(error)}` };
        }
      }

      // intent === "create"
      // If the message looks like a general question, let the AI agent handle it
      if (isGeneralQuestion(content)) {
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
        const parsed = parseCalendarText(content, now);
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
