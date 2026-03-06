import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createScheduleStore } from "../schedule-store.js";
import type { ScheduleEntry } from "../schedule-store.js";

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    channelId: "channel-123",
    prompt: "今日の天気を教えて",
    expression: "毎朝9時",
    pattern: { type: "daily", hour: 9, minute: 0 },
    nextRun: new Date("2026-03-05T00:00:00.000Z").toISOString(),
    createdAt: new Date("2026-03-04T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("createScheduleStore", () => {
  describe("list / add", () => {
    it("should start empty", () => {
      // Given: a fresh store
      const store = createScheduleStore();

      // When: listing
      expect(store.list()).toHaveLength(0);
    });

    it("should add and list an entry", () => {
      // Given: a fresh store
      const store = createScheduleStore();
      const entry = makeEntry();

      // When: adding an entry
      store.add(entry);

      // Then: it appears in the list
      expect(store.list()).toHaveLength(1);
      expect(store.list()[0]).toEqual(entry);
    });

    it("should return a copy of the list (immutable snapshot)", () => {
      // Given: a store with one entry
      const store = createScheduleStore();
      store.add(makeEntry());

      // When: mutating the returned list
      const list = store.list();
      list.push(makeEntry({ id: "other-id" }));

      // Then: internal state is unchanged
      expect(store.list()).toHaveLength(1);
    });
  });

  describe("remove", () => {
    it("should remove an entry by id and return true", () => {
      // Given: a store with an entry
      const store = createScheduleStore();
      const entry = makeEntry();
      store.add(entry);

      // When: removing by id
      const result = store.remove(entry.id);

      // Then: entry is gone, returns true
      expect(result).toBe(true);
      expect(store.list()).toHaveLength(0);
    });

    it("should return false when id does not exist", () => {
      // Given: a store
      const store = createScheduleStore();

      // When: removing non-existent id
      const result = store.remove("non-existent-id");

      // Then: returns false
      expect(result).toBe(false);
    });
  });

  describe("updateNextRun", () => {
    it("should update nextRun for a given id", () => {
      // Given: a store with an entry
      const store = createScheduleStore();
      const entry = makeEntry();
      store.add(entry);
      const newDate = new Date("2026-03-06T00:00:00.000Z");

      // When: updating nextRun
      store.updateNextRun(entry.id, newDate);

      // Then: nextRun is updated
      expect(store.list()[0].nextRun).toBe(newDate.toISOString());
    });
  });

  describe("findDue", () => {
    it("should return entries whose nextRun is <= now", () => {
      // Given: two entries, one due and one future
      const store = createScheduleStore();
      const dueEntry = makeEntry({ id: "due", nextRun: new Date("2026-03-04T09:00:00.000Z").toISOString() });
      const futureEntry = makeEntry({ id: "future", nextRun: new Date("2026-03-05T09:00:00.000Z").toISOString() });
      store.add(dueEntry);
      store.add(futureEntry);
      const now = new Date("2026-03-04T10:00:00.000Z");

      // When: finding due entries
      const due = store.findDue(now);

      // Then: only the due entry is returned
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe("due");
    });

    it("should return empty array when nothing is due", () => {
      // Given: all entries are in the future
      const store = createScheduleStore();
      store.add(makeEntry({ nextRun: new Date("2026-03-10T09:00:00.000Z").toISOString() }));
      const now = new Date("2026-03-04T10:00:00.000Z");

      // When: finding due entries
      const due = store.findDue(now);

      // Then: empty
      expect(due).toHaveLength(0);
    });
  });

  describe("file persistence", () => {
    const testDir = join(tmpdir(), `schedule-store-test-${process.pid}`);
    const testFile = join(testDir, "schedules.json");

    afterEach(() => {
      if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    });

    it("should save to file when filePath is provided", () => {
      // Given: a store with filePath
      const store = createScheduleStore({ filePath: testFile });

      // When: adding an entry
      store.add(makeEntry());

      // Then: file is written with entries
      expect(existsSync(testFile)).toBe(true);
      const data = JSON.parse(readFileSync(testFile, "utf-8"));
      expect(data.entries).toHaveLength(1);
    });

    it("should load entries from existing file", () => {
      // Given: a file with saved entries
      const store1 = createScheduleStore({ filePath: testFile });
      store1.add(makeEntry());

      // When: creating a new store with the same file
      const store2 = createScheduleStore({ filePath: testFile });

      // Then: entries are loaded
      expect(store2.list()).toHaveLength(1);
      expect(store2.list()[0].prompt).toBe("今日の天気を教えて");
    });

    it("should start empty when file does not exist", () => {
      // Given: no file exists
      const store = createScheduleStore({ filePath: testFile });

      // When/Then: store is empty
      expect(store.list()).toHaveLength(0);
    });

    it("should start empty when file contains invalid JSON", () => {
      // Given: a file with invalid content
      mkdirSync(testDir, { recursive: true });
      const { writeFileSync } = require("node:fs");
      writeFileSync(testFile, "not json");

      // When: creating a store with that path
      const store = createScheduleStore({ filePath: testFile });

      // Then: empty
      expect(store.list()).toHaveLength(0);
    });

    it("should persist removal", () => {
      // Given: a store with an entry saved to file
      const store1 = createScheduleStore({ filePath: testFile });
      const entry = makeEntry();
      store1.add(entry);
      store1.remove(entry.id);

      // When: creating a new store
      const store2 = createScheduleStore({ filePath: testFile });

      // Then: entry is not present
      expect(store2.list()).toHaveLength(0);
    });
  });
});
