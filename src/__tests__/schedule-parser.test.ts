import { describe, it, expect } from "vitest";
import { parseScheduleExpression, computeNextRun } from "../schedule-parser.js";

describe("parseScheduleExpression", () => {
  describe("daily patterns", () => {
    it("should parse 毎朝9時 as daily 9:00", () => {
      // Given: a daily expression
      // When: parsing
      const result = parseScheduleExpression("毎朝9時");

      // Then: daily pattern at 9:00
      expect(result).toEqual({ type: "daily", hour: 9, minute: 0 });
    });

    it("should parse 毎日18時30分 as daily 18:30", () => {
      // Given: a daily expression with minute
      const result = parseScheduleExpression("毎日18時30分");

      // Then: daily pattern at 18:30
      expect(result).toEqual({ type: "daily", hour: 18, minute: 30 });
    });

    it("should parse 毎晩22時 as daily 22:00", () => {
      const result = parseScheduleExpression("毎晩22時");
      expect(result).not.toBeNull();
      expect(result?.type).toBe("daily");
      expect(result?.hour).toBe(22);
    });
  });

  describe("weekly patterns", () => {
    it("should parse 毎週月曜12時 as weekly Monday 12:00", () => {
      // Given: a weekly expression
      const result = parseScheduleExpression("毎週月曜12時");

      // Then: weekly pattern on Monday (weekday=1)
      expect(result).not.toBeNull();
      expect(result?.type).toBe("weekly");
      if (result?.type === "weekly") {
        expect(result.weekday).toBe(1); // Monday
        expect(result.hour).toBe(12);
        expect(result.minute).toBe(0);
      }
    });

    it("should parse 毎週金曜18時 as weekly Friday 18:00", () => {
      const result = parseScheduleExpression("毎週金曜18時");

      expect(result?.type).toBe("weekly");
      if (result?.type === "weekly") {
        expect(result.weekday).toBe(5); // Friday
        expect(result.hour).toBe(18);
      }
    });
  });

  describe("invalid patterns", () => {
    it("should return null for expressions without a time", () => {
      // Given: an expression with no time information
      const result = parseScheduleExpression("毎日");

      // Then: null is returned
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const result = parseScheduleExpression("");
      expect(result).toBeNull();
    });

    it("should return null for gibberish", () => {
      const result = parseScheduleExpression("xxxyyy");
      expect(result).toBeNull();
    });
  });
});

describe("computeNextRun", () => {
  describe("daily pattern", () => {
    it("should return today's run time when current time is before the scheduled time", () => {
      // Given: daily at 9:00, current time is 8:00
      const now = new Date("2026-03-04T08:00:00.000Z");
      // Adjust to local-like: simulate as local time via UTC
      const nowLocal = new Date(2026, 2, 4, 8, 0, 0); // March 4, 2026 08:00 local
      const pattern = { type: "daily" as const, hour: 9, minute: 0 };

      // When: computing next run
      const next = computeNextRun(pattern, nowLocal);

      // Then: next run is today at 9:00
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
      expect(next.getDate()).toBe(nowLocal.getDate());
    });

    it("should return tomorrow's run time when current time is past the scheduled time", () => {
      // Given: daily at 9:00, current time is 10:00
      const nowLocal = new Date(2026, 2, 4, 10, 0, 0); // 10:00
      const pattern = { type: "daily" as const, hour: 9, minute: 0 };

      // When: computing next run
      const next = computeNextRun(pattern, nowLocal);

      // Then: next run is tomorrow at 9:00
      expect(next.getHours()).toBe(9);
      expect(next.getDate()).toBe(5); // March 5
    });
  });

  describe("weekly pattern", () => {
    it("should return next Monday when today is Wednesday", () => {
      // Given: weekly on Monday at 9:00, today is Wednesday March 4, 2026
      const nowLocal = new Date(2026, 2, 4, 10, 0, 0); // Wednesday (getDay()=3)
      expect(nowLocal.getDay()).toBe(3); // verify Wednesday
      const pattern = { type: "weekly" as const, weekday: 1, hour: 9, minute: 0 };

      // When: computing next run
      const next = computeNextRun(pattern, nowLocal);

      // Then: next run is Monday March 9
      expect(next.getDay()).toBe(1);
      expect(next.getDate()).toBe(9);
    });

    it("should return next week when today matches and time has passed", () => {
      // Given: weekly on Wednesday at 9:00, today is Wednesday at 10:00
      const nowLocal = new Date(2026, 2, 4, 10, 0, 0); // Wednesday 10:00
      const pattern = { type: "weekly" as const, weekday: 3, hour: 9, minute: 0 };

      // When: computing next run (time has passed)
      const next = computeNextRun(pattern, nowLocal);

      // Then: next Wednesday (7 days later)
      expect(next.getDay()).toBe(3);
      expect(next.getDate()).toBe(11); // March 11
    });

    it("should return same day when today matches and time has not passed", () => {
      // Given: weekly on Wednesday at 15:00, today is Wednesday at 10:00
      const nowLocal = new Date(2026, 2, 4, 10, 0, 0); // Wednesday 10:00
      const pattern = { type: "weekly" as const, weekday: 3, hour: 15, minute: 0 };

      // When: computing next run (time not yet reached)
      const next = computeNextRun(pattern, nowLocal);

      // Then: this Wednesday at 15:00
      expect(next.getDay()).toBe(3);
      expect(next.getDate()).toBe(4);
      expect(next.getHours()).toBe(15);
    });
  });
});
