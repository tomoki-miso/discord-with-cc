import { runCommand } from "./process.js";

export class CalendarEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarEventError";
  }
}

export type CalendarEventRequest = {
  title: string;
  calendarName: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
};

export type CalendarEventResult = {
  uid: string;
};

export type EventSummary = {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  calendarName: string;
};

export type EventUpdate = {
  title?: string;
  start?: Date;
  end?: Date;
  location?: string;
  description?: string;
};

const MONTH_NAMES: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function createCalendarEvent(request: CalendarEventRequest): Promise<CalendarEventResult> {
  const script = buildAppleScript(request);
  const result = await runCommand("osascript", [], { input: script });

  if (result.exitCode !== 0) {
    throw new CalendarEventError(result.stderr.trim() || result.stdout.trim() || "カレンダーの追加に失敗しました。");
  }

  const uid = result.stdout.trim();
  if (!uid) {
    throw new CalendarEventError("カレンダーからUIDを取得できませんでした。");
  }

  return { uid };
}

function buildAppleScript(request: CalendarEventRequest): string {
  const start = request.start;
  const end = request.end.getTime() > start.getTime() ? request.end : new Date(start.getTime() + 60 * 60 * 1000);
  const startSeconds = start.getHours() * 3600 + start.getMinutes() * 60 + start.getSeconds();
  const durationSeconds = Math.max(60, Math.round((end.getTime() - start.getTime()) / 1000));

  const monthName = MONTH_NAMES[start.getMonth()];
  const escapedTitle = escapeAppleScriptString(request.title || "(無題の予定)");
  const escapedCalendar = escapeAppleScriptString(request.calendarName);
  const escapedLocation = request.location ? escapeAppleScriptString(request.location) : undefined;
  const escapedDescription = request.description ? escapeAppleScriptString(request.description) : undefined;

  const propertyParts = [
    `summary:"${escapedTitle}"`,
    "start date:startDate",
    "end date:endDate",
    "allday event:false",
  ];
  if (escapedLocation) {
    propertyParts.push(`location:"${escapedLocation}"`);
  }
  if (escapedDescription) {
    propertyParts.push(`description:"${escapedDescription}"`);
  }

  const propertiesBlock = propertyParts.join(", ");

  return `set startDate to current date
set year of startDate to ${start.getFullYear()}
set month of startDate to ${monthName}
set day of startDate to ${start.getDate()}
set time of startDate to ${startSeconds}
set endDate to startDate + ${durationSeconds}

tell application "Calendar"
    set targetCal to first calendar whose name is "${escapedCalendar}"
    set newEvent to make new event at end of events of targetCal with properties {${propertiesBlock}}
    return uid of newEvent
end tell
`;
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

export async function listCalendars(): Promise<string[]> {
  const script = `tell application "Calendar"
    set calNames to {}
    repeat with cal in calendars
        set end of calNames to name of cal
    end repeat
    return calNames
end tell`;
  const result = await runCommand("osascript", [], { input: script });
  if (result.exitCode !== 0) {
    throw new CalendarEventError(result.stderr.trim() || "カレンダー一覧の取得に失敗しました。");
  }
  const raw = result.stdout.trim();
  if (!raw) return [];
  return raw.split(", ").map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function listEvents(calendarName: string | null, start: Date, end: Date): Promise<EventSummary[]> {
  const startEpoch = Math.floor(start.getTime() / 1000);
  const endEpoch = Math.floor(end.getTime() / 1000);
  // Timezone-corrected Apple epoch offset:
  // 978307200 is UTC epoch of 2001-01-01 00:00:00 UTC.
  // AppleScript date arithmetic uses local time, so subtract the UTC offset
  // to get the correct local-to-UTC mapping.
  const tzOffsetSeconds = -new Date().getTimezoneOffset() * 60;
  const appleEpochOffset = 978307200 - tzOffsetSeconds;

  const calFilter = calendarName
    ? `set targetCals to {first calendar whose name is "${escapeAppleScriptString(calendarName)}"}`
    : `set targetCals to every calendar`;

  const script = `set refDate to current date
set year of refDate to 2001
set month of refDate to January
set day of refDate to 1
set time of refDate to 0
set appleEpochOffset to ${appleEpochOffset}

tell application "Calendar"
    ${calFilter}
    set resultLines to {}
    repeat with cal in targetCals
        set calName to name of cal
        repeat with evt in (every event of cal)
            try
                set evtStart to (start date of evt)
                set evtEnd to (end date of evt)
                set startEpochSec to (evtStart - refDate) + appleEpochOffset
                set endEpochSec to (evtEnd - refDate) + appleEpochOffset
                if startEpochSec >= ${startEpoch} and startEpochSec <= ${endEpoch} then
                    set evtUid to uid of evt
                    set evtTitle to summary of evt
                    set resultLines to resultLines & {evtUid & tab & startEpochSec & tab & endEpochSec & tab & evtTitle & tab & calName}
                end if
            end try
        end repeat
    end repeat
    set AppleScript's text item delimiters to linefeed
    set output to resultLines as text
    set AppleScript's text item delimiters to ""
    return output
end tell`;

  const result = await runCommand("osascript", [], { input: script });
  if (result.exitCode !== 0) {
    throw new CalendarEventError(result.stderr.trim() || "イベント一覧の取得に失敗しました。");
  }
  const raw = result.stdout.trim();
  if (!raw) return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      if (parts.length < 5) return null;
      const [uid, startStr, endStr, title, calName] = parts;
      return {
        uid: uid.trim(),
        title: title.trim(),
        start: new Date(parseInt(startStr.trim(), 10) * 1000),
        end: new Date(parseInt(endStr.trim(), 10) * 1000),
        calendarName: calName.trim(),
      } satisfies EventSummary;
    })
    .filter((e): e is EventSummary => e !== null);
}

export async function deleteEvent(calendarName: string, uid: string): Promise<void> {
  const escapedCal = escapeAppleScriptString(calendarName);
  const escapedUid = escapeAppleScriptString(uid);
  const script = `tell application "Calendar"
    set targetCal to first calendar whose name is "${escapedCal}"
    set targetEvent to first event of targetCal whose uid is "${escapedUid}"
    delete targetEvent
end tell`;
  const result = await runCommand("osascript", [], { input: script });
  if (result.exitCode !== 0) {
    throw new CalendarEventError(result.stderr.trim() || "イベントの削除に失敗しました。");
  }
}

export async function updateEvent(calendarName: string, uid: string, updates: EventUpdate): Promise<void> {
  const escapedCal = escapeAppleScriptString(calendarName);
  const escapedUid = escapeAppleScriptString(uid);

  const setLines: string[] = [];

  if (updates.title !== undefined) {
    setLines.push(`set summary of targetEvent to "${escapeAppleScriptString(updates.title)}"`);
  }
  if (updates.location !== undefined) {
    setLines.push(`set location of targetEvent to "${escapeAppleScriptString(updates.location)}"`);
  }
  if (updates.description !== undefined) {
    setLines.push(`set description of targetEvent to "${escapeAppleScriptString(updates.description)}"`);
  }
  if (updates.start !== undefined) {
    const s = updates.start;
    const monthName = MONTH_NAMES[s.getMonth()];
    const secs = s.getHours() * 3600 + s.getMinutes() * 60 + s.getSeconds();
    setLines.push(
      `set newStart to current date`,
      `set year of newStart to ${s.getFullYear()}`,
      `set month of newStart to ${monthName}`,
      `set day of newStart to ${s.getDate()}`,
      `set time of newStart to ${secs}`,
      `set start date of targetEvent to newStart`,
    );
  }
  if (updates.end !== undefined) {
    const e = updates.end;
    const monthName = MONTH_NAMES[e.getMonth()];
    const secs = e.getHours() * 3600 + e.getMinutes() * 60 + e.getSeconds();
    setLines.push(
      `set newEnd to current date`,
      `set year of newEnd to ${e.getFullYear()}`,
      `set month of newEnd to ${monthName}`,
      `set day of newEnd to ${e.getDate()}`,
      `set time of newEnd to ${secs}`,
      `set end date of targetEvent to newEnd`,
    );
  }

  if (setLines.length === 0) return;

  const script = `tell application "Calendar"
    set targetCal to first calendar whose name is "${escapedCal}"
    set targetEvent to first event of targetCal whose uid is "${escapedUid}"
    ${setLines.join("\n    ")}
end tell`;
  const result = await runCommand("osascript", [], { input: script });
  if (result.exitCode !== 0) {
    throw new CalendarEventError(result.stderr.trim() || "イベントの更新に失敗しました。");
  }
}
