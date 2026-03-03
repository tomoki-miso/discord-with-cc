import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCalendarModeController, detectIntent, extractSearchQuery } from "../calendar-mode.js";
import { createCalendarModeStore } from "../calendar-store.js";
import type { EventSummary } from "../calendar-service.js";

const FIXED_NOW = new Date("2026-03-02T00:00:00+09:00");

describe("createCalendarModeController", () => {
  it("handles activation commands", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("on", "channel-1");
    expect(message).toContain("開始しました");
    expect(store.isActive("channel-1")).toBe(true);
  });

  it("requires default calendar before adding events", async () => {
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    const controller = createCalendarModeController({ store });

    const result = await controller.handleNaturalLanguageInput("明日8時会議", "channel-1");
    expect(result.handled).toBe(true);
    expect(result.response).toContain("デフォルトのカレンダー");
  });

  it("creates events when configured", async () => {
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "自宅");

    const createEvent = vi.fn().mockResolvedValue({ uid: "UID-1" });
    const controller = createCalendarModeController({
      store,
      now: () => new Date(FIXED_NOW),
      createEvent,
    });

    const result = await controller.handleNaturalLanguageInput("明日8時に会議", "channel-1");

    expect(result.handled).toBe(true);
    expect(result.response).toContain("UID-1");
    expect(createEvent).toHaveBeenCalled();
    const args = createEvent.mock.calls[0][0];
    expect(args.calendarName).toBe("自宅");
    expect(args.title).toBe("会議");
  });

  it("passes location and description metadata", async () => {
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "自宅");

    const createEvent = vi.fn().mockResolvedValue({ uid: "UID-2" });
    const controller = createCalendarModeController({
      store,
      now: () => new Date(FIXED_NOW),
      createEvent,
    });

    const message = `明日10時 おやつ\n場所: 東京都千代田区1-1\nhttps://example.com/menu\nメモ: スイーツを予約`;
    await controller.handleNaturalLanguageInput(message, "channel-1");

    const args = createEvent.mock.calls[0][0];
    expect(args.location).toBe("東京都千代田区1-1");
    expect(args.description).toContain("https://example.com/menu");
    expect(args.description).toContain("スイーツを予約");
  });
});

describe("detectIntent", () => {
  const now = new Date(FIXED_NOW);

  it("detects list_calendars intent in Japanese", () => {
    expect(detectIntent("カレンダーの一覧を見せて", now)).toBe("list_calendars");
    expect(detectIntent("カレンダーを表示して", now)).toBe("list_calendars");
    expect(detectIntent("カレンダーリストを教えて", now)).toBe("list_calendars");
  });

  it("detects list_calendars intent in English", () => {
    expect(detectIntent("list calendars", now)).toBe("list_calendars");
    expect(detectIntent("show calendars", now)).toBe("list_calendars");
  });

  it("detects list_events intent for schedule queries", () => {
    expect(detectIntent("今日の予定を見せて", now)).toBe("list_events");
    expect(detectIntent("今週のスケジュールを確認したい", now)).toBe("list_events");
    expect(detectIntent("来週の予定を教えて", now)).toBe("list_events");
  });

  it("detects delete intent in Japanese", () => {
    expect(detectIntent("明日の会議を削除して", now)).toBe("delete");
    expect(detectIntent("予定をキャンセルしたい", now)).toBe("delete");
  });

  it("detects delete intent in English", () => {
    expect(detectIntent("delete the meeting", now)).toBe("delete");
    expect(detectIntent("remove this event", now)).toBe("delete");
  });

  it("detects update intent in Japanese", () => {
    expect(detectIntent("会議の時間を変更したい", now)).toBe("update");
    expect(detectIntent("予定を来週に移動して", now)).toBe("update");
    expect(detectIntent("リスケして", now)).toBe("update");
  });

  it("detects update intent in English", () => {
    expect(detectIntent("reschedule the meeting", now)).toBe("update");
    expect(detectIntent("change the event", now)).toBe("update");
  });

  it("falls back to create intent", () => {
    expect(detectIntent("明日9時に会議", now)).toBe("create");
    expect(detectIntent("来週月曜10時からランチ", now)).toBe("create");
  });
});

describe("extractSearchQuery", () => {
  it("extracts keyword before deletion verb", () => {
    expect(extractSearchQuery("明日の会議を削除して")).toBe("明日の会議");
    expect(extractSearchQuery("予定をキャンセルして")).toBe("予定");
  });

  it("returns cleaned text when no verb pattern matches", () => {
    const result = extractSearchQuery("会議");
    expect(result).toBeTruthy();
  });
});

describe("handleNaturalLanguageInput - list_calendars", () => {
  it("returns calendar names in response", async () => {
    // Given
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    const listCalendarsImpl = vi.fn().mockResolvedValue(["自宅", "仕事", "家族"]);
    const controller = createCalendarModeController({ store, listCalendarsImpl });

    // When
    const result = await controller.handleNaturalLanguageInput("カレンダーの一覧を見せて", "channel-1");

    // Then
    expect(result.handled).toBe(true);
    expect(result.response).toContain("自宅");
    expect(result.response).toContain("仕事");
    expect(result.response).toContain("家族");
  });
});

describe("handleNaturalLanguageInput - list_events", () => {
  it("returns event titles in response", async () => {
    // Given
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "自宅");
    const mockEvents: EventSummary[] = [
      { uid: "1", title: "朝の会議", start: new Date(FIXED_NOW), end: new Date(FIXED_NOW), calendarName: "自宅" },
      { uid: "2", title: "ランチ", start: new Date(FIXED_NOW), end: new Date(FIXED_NOW), calendarName: "自宅" },
    ];
    const listEventsImpl = vi.fn().mockResolvedValue(mockEvents);
    const controller = createCalendarModeController({ store, now: () => new Date(FIXED_NOW), listEventsImpl });

    // When
    const result = await controller.handleNaturalLanguageInput("今日の予定を見せて", "channel-1");

    // Then
    expect(result.handled).toBe(true);
    expect(result.response).toContain("朝の会議");
    expect(result.response).toContain("ランチ");
  });
});

describe("handleNaturalLanguageInput - delete 3ターンフロー", () => {
  let store: ReturnType<typeof createCalendarModeStore>;
  let listEventsImpl: ReturnType<typeof vi.fn>;
  let deleteEventImpl: ReturnType<typeof vi.fn>;

  const mockEvents: EventSummary[] = [
    { uid: "uid-1", title: "チームミーティング", start: new Date(FIXED_NOW), end: new Date(FIXED_NOW), calendarName: "仕事" },
    { uid: "uid-2", title: "会議", start: new Date(FIXED_NOW), end: new Date(FIXED_NOW), calendarName: "仕事" },
  ];

  beforeEach(() => {
    store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "仕事");
    listEventsImpl = vi.fn().mockResolvedValue(mockEvents);
    deleteEventImpl = vi.fn().mockResolvedValue(undefined);
  });

  it("turn 1: shows candidate list", async () => {
    // Given
    const controller = createCalendarModeController({
      store,
      now: () => new Date(FIXED_NOW),
      listEventsImpl,
      deleteEventImpl,
    });

    // When
    const result = await controller.handleNaturalLanguageInput("明日の予定を削除して", "channel-1");

    // Then
    expect(result.handled).toBe(true);
    expect(result.response).toContain("1.");
    expect(result.response).toContain("2.");
  });

  it("turn 2: number selection leads to confirmation prompt", async () => {
    // Given: pending select_candidate is already set
    store.setPendingOperation("channel-1", {
      type: "select_candidate",
      opType: "delete",
      candidates: mockEvents,
    });
    const controller = createCalendarModeController({ store, deleteEventImpl });

    // When
    const result = await controller.handleNaturalLanguageInput("2", "channel-1");

    // Then
    expect(result.handled).toBe(true);
    expect(result.response).toContain("削除しますか");
    expect(store.getPendingOperation("channel-1")?.type).toBe("confirm_delete");
  });

  it("turn 3: 'yes' deletes event and clears pending", async () => {
    // Given: pending confirm_delete is already set
    store.setPendingOperation("channel-1", {
      type: "confirm_delete",
      selectedEvent: mockEvents[1],
    });
    const controller = createCalendarModeController({ store, deleteEventImpl });

    // When
    const result = await controller.handleNaturalLanguageInput("yes", "channel-1");

    // Then
    expect(deleteEventImpl).toHaveBeenCalledOnce();
    expect(deleteEventImpl).toHaveBeenCalledWith("仕事", "uid-2");
    expect(result.response).toContain("削除しました");
    expect(store.getPendingOperation("channel-1")).toBeUndefined();
  });

  it("'no' cancels deletion without calling deleteEventImpl", async () => {
    // Given
    store.setPendingOperation("channel-1", {
      type: "confirm_delete",
      selectedEvent: mockEvents[0],
    });
    const controller = createCalendarModeController({ store, deleteEventImpl });

    // When
    const result = await controller.handleNaturalLanguageInput("no", "channel-1");

    // Then
    expect(deleteEventImpl).not.toHaveBeenCalled();
    expect(result.response).toContain("キャンセル");
    expect(store.getPendingOperation("channel-1")).toBeUndefined();
  });
});

describe("handleNaturalLanguageInput - update 2ターンフロー（候補1件）", () => {
  it("turn 1: 1 candidate leads directly to confirm_update", async () => {
    // Given
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "自宅");

    const singleEvent: EventSummary[] = [
      { uid: "uid-1", title: "会議", start: new Date(FIXED_NOW), end: new Date(FIXED_NOW), calendarName: "自宅" },
    ];
    const listEventsImpl = vi.fn().mockResolvedValue(singleEvent);
    const updateEventImpl = vi.fn().mockResolvedValue(undefined);
    const controller = createCalendarModeController({
      store,
      now: () => new Date(FIXED_NOW),
      listEventsImpl,
      updateEventImpl,
    });

    // When
    const result = await controller.handleNaturalLanguageInput("明日の会議を来週月曜に変更して", "channel-1");

    // Then
    expect(result.handled).toBe(true);
    expect(result.response).toContain("更新しますか");
    expect(store.getPendingOperation("channel-1")?.type).toBe("confirm_update");
  });

  it("turn 2: 'yes' updates event and clears pending", async () => {
    // Given
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);

    const targetEvent: EventSummary = {
      uid: "uid-1",
      title: "会議",
      start: new Date(FIXED_NOW),
      end: new Date(FIXED_NOW),
      calendarName: "自宅",
    };
    const updateData = { start: new Date("2026-03-09T10:00:00+09:00"), end: new Date("2026-03-09T11:00:00+09:00") };
    store.setPendingOperation("channel-1", { type: "confirm_update", selectedEvent: targetEvent, updateData });

    const updateEventImpl = vi.fn().mockResolvedValue(undefined);
    const controller = createCalendarModeController({ store, updateEventImpl });

    // When
    const result = await controller.handleNaturalLanguageInput("yes", "channel-1");

    // Then
    expect(updateEventImpl).toHaveBeenCalledOnce();
    expect(updateEventImpl).toHaveBeenCalledWith("自宅", "uid-1", updateData);
    expect(result.response).toContain("更新しました");
    expect(store.getPendingOperation("channel-1")).toBeUndefined();
  });
});
