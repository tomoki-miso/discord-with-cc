import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScheduleRunner } from "../schedule-runner.js";
import { createScheduleStore } from "../schedule-store.js";
import type { ScheduleEntry } from "../schedule-store.js";

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    channelId: "channel-123",
    prompt: "天気を教えて",
    expression: "毎朝9時",
    pattern: { type: "daily", hour: 9, minute: 0 },
    nextRun: new Date("2026-03-04T00:00:00.000Z").toISOString(), // already due
    createdAt: new Date("2026-03-03T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("createScheduleRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should fire onFire when a due entry exists after tick", async () => {
    // Given: a store with a due entry
    const store = createScheduleStore();
    store.add(makeEntry());
    const onFire = vi.fn().mockResolvedValue(undefined);
    const runner = createScheduleRunner({ store, onFire });
    runner.start();

    // When: 1 minute passes
    await vi.advanceTimersByTimeAsync(60_000);

    // Then: onFire was called with the entry's channel and prompt
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith("channel-123", "天気を教えて");
  });

  it("should update nextRun before firing to prevent duplicate execution", async () => {
    // Given: a due entry
    const store = createScheduleStore();
    const entry = makeEntry();
    store.add(entry);
    const onFire = vi.fn().mockResolvedValue(undefined);
    createScheduleRunner({ store, onFire }).start();

    // When: tick fires
    await vi.advanceTimersByTimeAsync(60_000);

    // Then: nextRun is updated to a future time
    const updated = store.list()[0];
    expect(new Date(updated.nextRun).getTime()).toBeGreaterThan(Date.now());
  });

  it("should not fire when no entries are due", async () => {
    // Given: an entry with a future nextRun
    const store = createScheduleStore();
    store.add(makeEntry({
      nextRun: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
    }));
    const onFire = vi.fn().mockResolvedValue(undefined);
    createScheduleRunner({ store, onFire }).start();

    // When: 1 minute passes
    await vi.advanceTimersByTimeAsync(60_000);

    // Then: onFire is not called
    expect(onFire).not.toHaveBeenCalled();
  });

  it("should continue ticking after onFire throws", async () => {
    // Given: a runner where onFire throws on first call, succeeds on second
    const store = createScheduleStore();
    store.add(makeEntry({ id: "id-1" }));
    const onFire = vi.fn().mockRejectedValueOnce(new Error("network error")).mockResolvedValue(undefined);
    createScheduleRunner({ store, onFire }).start();

    // When: two ticks pass
    await vi.advanceTimersByTimeAsync(60_000);
    store.add(makeEntry({ id: "id-2", nextRun: new Date(Date.now() - 1000).toISOString() }));
    await vi.advanceTimersByTimeAsync(60_000);

    // Then: second call still happens (loop continues despite first error)
    expect(onFire).toHaveBeenCalledTimes(2);
  });

  it("should stop ticking after stop() is called", async () => {
    // Given: a running runner
    const store = createScheduleStore();
    store.add(makeEntry());
    const onFire = vi.fn().mockResolvedValue(undefined);
    const runner = createScheduleRunner({ store, onFire });
    runner.start();

    // When: stop is called and tick time passes
    runner.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    // Then: onFire is not called
    expect(onFire).not.toHaveBeenCalled();
  });
});
