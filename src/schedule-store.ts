import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SchedulePattern } from "./schedule-parser.js";

export type ScheduleEntry = {
  id: string;
  channelId: string;
  prompt: string;
  expression: string;   // 元の自然言語テキスト（list表示用）
  pattern: SchedulePattern;  // 再起動後の再計算用
  nextRun: string;      // ISO 8601
  createdAt: string;    // ISO 8601
};

export type ScheduleStore = {
  list(): ScheduleEntry[];
  add(entry: ScheduleEntry): void;
  remove(id: string): boolean;
  updateNextRun(id: string, nextRun: Date): void;
  findDue(now: Date): ScheduleEntry[];
};

type PersistedData = { entries: ScheduleEntry[] };

function loadFromFile(filePath: string): ScheduleEntry[] {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as PersistedData;
    if (Array.isArray(data.entries)) return data.entries;
  } catch {
    // ファイルなし・不正JSON → 空配列で開始
  }
  return [];
}

function saveToFile(filePath: string, entries: ScheduleEntry[]): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ entries }, null, 2) + "\n");
  } catch {
    // Best-effort
  }
}

export function createScheduleStore(options: { filePath?: string } = {}): ScheduleStore {
  let entries: ScheduleEntry[] = options.filePath
    ? loadFromFile(options.filePath)
    : [];

  const persist = () => {
    if (options.filePath) saveToFile(options.filePath, entries);
  };

  return {
    list() {
      return [...entries];
    },

    add(entry: ScheduleEntry) {
      entries.push(entry);
      persist();
    },

    remove(id: string): boolean {
      const before = entries.length;
      entries = entries.filter((e) => e.id !== id);
      if (entries.length < before) {
        persist();
        return true;
      }
      return false;
    },

    updateNextRun(id: string, nextRun: Date) {
      const entry = entries.find((e) => e.id === id);
      if (entry) {
        entry.nextRun = nextRun.toISOString();
        persist();
      }
    },

    findDue(now: Date): ScheduleEntry[] {
      return entries.filter((e) => new Date(e.nextRun) <= now);
    },
  };
}
