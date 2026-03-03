import { describe, it, expect, vi } from "vitest";
import { createCalendarModeController } from "../calendar-mode.js";
import { createCalendarModeStore } from "../calendar-store.js";

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
