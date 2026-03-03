import * as chrono from "chrono-node";

export class CalendarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarParseError";
  }
}

export type ParsedCalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  location?: string;
  url?: string;
  note?: string;
};

const DEFAULT_DURATION_MINUTES = 60;

export function parseCalendarText(input: string, now: Date = new Date()): ParsedCalendarEvent {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new CalendarParseError("予定内容を入力してください。");
  }

  const metadata = extractMetadata(trimmed);
  const chronoInput = metadata.chronoText;

  const results = chrono.ja.parse(chronoInput, now, { forwardDate: true });
  if (results.length === 0) {
    throw new CalendarParseError("日時を解釈できませんでした。");
  }

  const best = results[0];
  if (!best.start) {
    throw new CalendarParseError("開始日時が見つかりませんでした。");
  }

  const start = best.start.date();
  const explicitDuration = extractDurationMinutes(trimmed);
  let end: Date | undefined;
  if (typeof explicitDuration === "number") {
    end = new Date(start.getTime() + explicitDuration * 60 * 1000);
  } else if (best.end) {
    end = best.end.date();
  } else {
    end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
  }

  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);
  }

  const title = sanitizeTitle(deriveTitle(chronoInput, best.text));

  return {
    title,
    start,
    end,
    location: metadata.location,
    url: metadata.url,
    note: metadata.note,
  };
}

function deriveTitle(original: string, matched: string | undefined): string {
  if (!matched) return original;
  const index = original.indexOf(matched);
  if (index === -1) return original;
  const removed = `${original.slice(0, index)}${original.slice(index + matched.length)}`.trim();
  const cleaned = removed.replace(/^(?:から|より|について|についての|に|で|へ|を|は|が|と|、|。|:|,)+/u, "").trim();
  if (cleaned.length > 0) {
    return cleaned;
  }
  return removed.length > 0 ? removed : original.trim();
}

function extractDurationMinutes(text: string): number | undefined {
  let minutes = 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(時間|h|hours)/i);
  if (hourMatch) {
    minutes += Math.round(parseFloat(hourMatch[1]) * 60);
  }
  const minuteMatch = text.match(/(\d+)\s*(分|m|minutes)/i);
  if (minuteMatch) {
    minutes += parseInt(minuteMatch[1], 10);
  }
  if (minutes === 0) {
    return undefined;
  }
  return minutes;
}

function sanitizeTitle(value: string): string {
  const withoutBracketMentions = value
    .replace(/<@[!&]?[0-9]+>/g, "")
    .replace(/<#[0-9]+>/g, "");
  const withoutPlainMentions = withoutBracketMentions
    .replace(/@[\p{L}0-9_\-]+/gu, "")
    .replace(/https?:\/\/\S+/gi, "");
  const collapsed = withoutPlainMentions.replace(/\s+/g, " ").trim();
  if (collapsed.length > 0) {
    return collapsed;
  }
  return "(無題の予定)";
}

type MetadataExtraction = {
  chronoText: string;
  url?: string;
  location?: string;
  note?: string;
};

function extractMetadata(input: string): MetadataExtraction {
  const lines = input.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 0);
  const chronoLines: string[] = [];
  const noteParts: string[] = [];
  let url: string | undefined;
  let location: string | undefined;

  const locationKeywordRegex = /^(?:場所|会場|住所|location)[:：]?\s*(.+)$/i;
  const noteKeywordRegex = /^(?:メモ|備考|note|memo)[:：]?\s*(.+)$/i;

  for (const originalLine of lines) {
    let line = originalLine;
    if (!url) {
      const urlMatch = line.match(/https?:\/\/\S+/i);
      if (urlMatch) {
        url = urlMatch[0];
        line = line.replace(urlMatch[0], "").trim();
        if (line.length === 0) {
          continue;
        }
      }
    }

    const locMatch = line.match(locationKeywordRegex);
    if (locMatch) {
      location = locMatch[1].trim();
      continue;
    }

    const noteMatch = line.match(noteKeywordRegex);
    if (noteMatch) {
      noteParts.push(noteMatch[1].trim());
      continue;
    }

    chronoLines.push(line);
  }

  if (!location) {
    location = detectAddressCandidate(input);
  }

  return {
    chronoText: chronoLines.length > 0 ? chronoLines.join(" ") : input,
    url,
    location,
    note: noteParts.length > 0 ? noteParts.join(" / ") : undefined,
  };
}

function detectAddressCandidate(text: string): string | undefined {
  const addressRegex = /([\p{Script=Han}A-Za-z0-9ー\-]+(?:都|道|府|県|市|区|町|村|丁目|番地|号|駅|ホール|会館|ビル)[^\s,。]*)/u;
  const match = text.match(addressRegex);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}
