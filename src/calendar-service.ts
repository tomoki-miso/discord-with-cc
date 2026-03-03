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
