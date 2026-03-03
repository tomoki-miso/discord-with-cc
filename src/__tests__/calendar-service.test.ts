import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunCommandResult } from "../process.js";

vi.mock("../process.js", () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from "../process.js";
import {
  listCalendars,
  listEvents,
  deleteEvent,
  updateEvent,
  CalendarEventError,
} from "../calendar-service.js";

const mockRunCommand = vi.mocked(runCommand);

function makeResult(stdout: string, exitCode = 0): RunCommandResult {
  return { stdout, stderr: "", exitCode };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCalendars", () => {
  it("returns array from comma-separated output", async () => {
    // Given osascript returns calendar names separated by ", "
    mockRunCommand.mockResolvedValue(makeResult("自宅, 仕事, 家族"));

    // When
    const result = await listCalendars();

    // Then
    expect(result).toEqual(["自宅", "仕事", "家族"]);
  });

  it("returns empty array when stdout is empty", async () => {
    // Given
    mockRunCommand.mockResolvedValue(makeResult(""));

    // When
    const result = await listCalendars();

    // Then
    expect(result).toEqual([]);
  });

  it("throws CalendarEventError on non-zero exit code", async () => {
    // Given
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "permission denied", exitCode: 1 });

    // When / Then
    await expect(listCalendars()).rejects.toThrow(CalendarEventError);
  });
});

describe("listEvents", () => {
  const now = new Date("2026-03-03T00:00:00+09:00");
  const start = new Date("2026-03-03T00:00:00+09:00");
  const end = new Date("2026-03-03T23:59:59+09:00");

  it("returns EventSummary array from tab-separated output", async () => {
    // Given: uid\tstartEpoch\tendEpoch\ttitle\tcalName
    const startEpoch = Math.floor(start.getTime() / 1000);
    const endEpoch = Math.floor(end.getTime() / 1000);
    mockRunCommand.mockResolvedValue(
      makeResult(`uid-1\t${startEpoch}\t${endEpoch}\t会議\t自宅\nuid-2\t${startEpoch}\t${endEpoch}\t勉強\t仕事`),
    );

    // When
    const result = await listEvents("自宅", start, end);

    // Then
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ uid: "uid-1", title: "会議", calendarName: "自宅" });
    expect(result[1]).toMatchObject({ uid: "uid-2", title: "勉強", calendarName: "仕事" });
    expect(result[0].start).toBeInstanceOf(Date);
  });

  it("returns empty array when stdout is empty", async () => {
    // Given
    mockRunCommand.mockResolvedValue(makeResult(""));

    // When
    const result = await listEvents(null, start, end);

    // Then
    expect(result).toEqual([]);
  });

  it("throws CalendarEventError on non-zero exit code", async () => {
    // Given
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "error", exitCode: 1 });

    // When / Then
    await expect(listEvents("自宅", start, end)).rejects.toThrow(CalendarEventError);
  });

  it("passes null calendarName as 'every calendar' in script", async () => {
    // Given
    mockRunCommand.mockResolvedValue(makeResult(""));

    // When
    await listEvents(null, start, end);

    // Then
    const callInput = mockRunCommand.mock.calls[0][2]?.input ?? "";
    expect(callInput).toContain("every calendar");
  });
});

describe("deleteEvent", () => {
  it("calls runCommand with uid in input script", async () => {
    // Given
    mockRunCommand.mockResolvedValue(makeResult(""));
    const uid = "test-uid-123";

    // When
    await deleteEvent("自宅", uid);

    // Then
    expect(mockRunCommand).toHaveBeenCalledOnce();
    const input = mockRunCommand.mock.calls[0][2]?.input ?? "";
    expect(input).toContain(uid);
    expect(input).toContain("自宅");
  });

  it("throws CalendarEventError on non-zero exit code", async () => {
    // Given
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "not found", exitCode: 1 });

    // When / Then
    await expect(deleteEvent("自宅", "uid-x")).rejects.toThrow(CalendarEventError);
  });
});

describe("updateEvent", () => {
  it("includes new title in script when title is provided", async () => {
    // Given
    mockRunCommand.mockResolvedValue(makeResult(""));

    // When
    await updateEvent("自宅", "uid-1", { title: "新しい会議" });

    // Then
    const input = mockRunCommand.mock.calls[0][2]?.input ?? "";
    expect(input).toContain("新しい会議");
  });

  it("includes new date in script when start is provided", async () => {
    // Given
    mockRunCommand.mockResolvedValue(makeResult(""));
    const newStart = new Date("2026-03-10T10:00:00+09:00");

    // When
    await updateEvent("自宅", "uid-1", { start: newStart });

    // Then
    const input = mockRunCommand.mock.calls[0][2]?.input ?? "";
    expect(input).toContain("newStart");
  });

  it("does not call runCommand when updates is empty", async () => {
    // Given / When
    await updateEvent("自宅", "uid-1", {});

    // Then
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it("throws CalendarEventError on non-zero exit code", async () => {
    // Given
    mockRunCommand.mockResolvedValue({ stdout: "", stderr: "error", exitCode: 1 });

    // When / Then
    await expect(updateEvent("自宅", "uid-1", { title: "new" })).rejects.toThrow(CalendarEventError);
  });
});
