import * as chrono from "chrono-node";

export type DailyPattern = { type: "daily"; hour: number; minute: number };
export type WeeklyPattern = { type: "weekly"; weekday: number; hour: number; minute: number };
export type SchedulePattern = DailyPattern | WeeklyPattern;

/**
 * 自然言語 → SchedulePattern。パース失敗時は null を返す。
 */
export function parseScheduleExpression(expr: string): SchedulePattern | null {
  const ref = new Date();
  const results = chrono.ja.parse(expr, ref, { forwardDate: true });
  if (results.length === 0) return null;

  const result = results[0];
  const start = result.start;

  if (!start.isCertain("hour")) return null;

  const hour = start.get("hour") ?? 0;
  const minute = start.get("minute") ?? 0;

  if (start.isCertain("weekday")) {
    const chronoWeekday = start.get("weekday") ?? 0;
    // chrono: 0=Sunday, 1=Monday, ..., 6=Saturday (JS と同じ)
    return { type: "weekly", weekday: chronoWeekday, hour, minute };
  }

  return { type: "daily", hour, minute };
}

/**
 * パターン + 現在時刻 → 次回実行時刻（純粋関数）
 */
export function computeNextRun(pattern: SchedulePattern, now: Date): Date {
  if (pattern.type === "daily") {
    const next = new Date(now);
    next.setHours(pattern.hour, pattern.minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // weekly
  const next = new Date(now);
  next.setHours(pattern.hour, pattern.minute, 0, 0);
  const daysUntil = (pattern.weekday - now.getDay() + 7) % 7;
  if (daysUntil === 0 && next <= now) {
    next.setDate(next.getDate() + 7);
  } else {
    next.setDate(next.getDate() + daysUntil);
  }
  return next;
}
