import { describe, it, expect } from "vitest";
import { createCalendarModeController } from "../calendar-mode.js";
import { createCalendarModeStore } from "../calendar-store.js";

describe("createCalendarModeController - handleCommand", () => {
  it("handles activation commands", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("on", "channel-1");
    expect(message).toContain("開始しました");
    expect(store.isActive("channel-1")).toBe(true);
  });

  it("handles deactivation commands", async () => {
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("off", "channel-1");
    expect(message).toContain("終了しました");
    expect(store.isActive("channel-1")).toBe(false);
  });

  it("returns status message", async () => {
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "自宅");
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("status", "channel-1");
    expect(message).toContain("ON");
    expect(message).toContain("自宅");
  });

  it("sets channel default calendar", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("default 仕事", "channel-1");
    expect(message).toContain("仕事");
    expect(store.getChannelDefaultCalendar("channel-1")).toBe("仕事");
  });

  it("sets global default calendar", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("default-global 共有", "channel-1");
    expect(message).toContain("共有");
    expect(store.getGlobalDefaultCalendar()).toBe("共有");
  });

  it("clears channel default calendar", async () => {
    const store = createCalendarModeStore();
    store.setChannelDefaultCalendar("channel-1", "自宅");
    const controller = createCalendarModeController({ store });

    await controller.handleCommand("clear-default", "channel-1");
    expect(store.getChannelDefaultCalendar("channel-1")).toBeUndefined();
  });

  it("returns help text when no args", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("", "channel-1");
    expect(message).toContain("!calendar on");
    expect(message).toContain("!calendar off");
  });

  it("returns help text for help command", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("help", "channel-1");
    expect(message).toContain("!calendar on");
  });

  it("returns error for unknown subcommand", async () => {
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    const message = await controller.handleCommand("unknown", "channel-1");
    expect(message).toContain("不明なサブコマンド");
  });
});

describe("createCalendarModeController - handleNaturalLanguageInput", () => {
  it("returns handled: false when calendar mode is OFF", async () => {
    // Given
    const store = createCalendarModeStore();
    const controller = createCalendarModeController({ store });

    // When
    const result = await controller.handleNaturalLanguageInput("明日8時に会議", "channel-1");

    // Then
    expect(result.handled).toBe(false);
    expect(result.response).toBe("");
  });

  it("returns handled: false when calendar mode is ON (delegates to Claude via onMessage)", async () => {
    // Given
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    const controller = createCalendarModeController({ store });

    // When
    const result = await controller.handleNaturalLanguageInput("明日8時に会議", "channel-1");

    // Then: Claudeに委ねるため handled: false を返す
    expect(result.handled).toBe(false);
    expect(result.response).toBe("");
  });

  it("returns handled: false for any message when calendar mode is ON", async () => {
    // Given
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    const controller = createCalendarModeController({ store });

    // When / Then
    for (const msg of ["カレンダーの一覧を見せて", "今日の予定", "会議を削除して", "予定を変更して"]) {
      const result = await controller.handleNaturalLanguageInput(msg, "channel-1");
      expect(result.handled).toBe(false);
    }
  });
});
