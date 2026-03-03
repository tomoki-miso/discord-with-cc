import { describe, it, expect } from "vitest";
import { parseCalendarText, CalendarParseError } from "../calendar-parser.js";

const BASE_DATE = new Date("2026-03-02T00:00:00+09:00");

describe("parseCalendarText", () => {
  it("parses relative Japanese expressions and extracts title", () => {
    // Given: a natural language description
    const result = parseCalendarText("明日8時に会議", BASE_DATE);

    // Then: start is tomorrow at 8 AM JST
    expect(result.start.getFullYear()).toBe(2026);
    expect(result.start.getMonth()).toBe(2); // March (0-indexed)
    expect(result.start.getDate()).toBe(3);
    expect(result.start.getHours()).toBe(8);
    expect(result.title).toBe("会議");
  });

  it("infers duration from expressions like 2時間30分", () => {
    // Given: a description with explicit duration
    const result = parseCalendarText("今日の13時から2時間30分 作業", BASE_DATE);

    // Then: duration is 150 minutes
    const diffMinutes = Math.round((result.end.getTime() - result.start.getTime()) / (60 * 1000));
    expect(diffMinutes).toBe(150);
  });

  it("falls back to default duration when none provided", () => {
    const result = parseCalendarText("今日の15時 支払い", BASE_DATE);
    const diffMinutes = Math.round((result.end.getTime() - result.start.getTime()) / (60 * 1000));
    expect(diffMinutes).toBe(60);
  });

  it("removes mention tokens from title", () => {
    const result = parseCalendarText("<@12345> 明日15時 @user おやつ", BASE_DATE);
    expect(result.title).toBe("おやつ");
  });

  it("captures location and URL metadata from separate lines", () => {
    const input = `明日10時 ランチ会\n場所: 東京都渋谷区神南1-1-1\nhttps://example.com/menu`;
    const result = parseCalendarText(input, BASE_DATE);
    expect(result.location).toBe("東京都渋谷区神南1-1-1");
    expect(result.url).toBe("https://example.com/menu");
    expect(result.title).toBe("ランチ会");
  });

  it("detects inline address fragments as location", () => {
    const result = parseCalendarText("今日18時 渋谷駅ハチ公前集合", BASE_DATE);
    expect(result.location).toContain("渋谷駅");
  });

  it("stores memo lines as note text", () => {
    const result = parseCalendarText("明日9時 打ち合わせ\nメモ: 資料を持参", BASE_DATE);
    expect(result.note).toBe("資料を持参");
  });

  it("throws when unable to parse date", () => {
    expect(() => parseCalendarText("タイトルだけ", BASE_DATE)).toThrow(CalendarParseError);
  });
});
