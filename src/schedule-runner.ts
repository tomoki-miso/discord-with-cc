import { computeNextRun } from "./schedule-parser.js";
import type { ScheduleStore } from "./schedule-store.js";

const TICK_INTERVAL_MS = 60_000; // 1分

export type ScheduleRunner = { start(): void; stop(): void };

export function createScheduleRunner(deps: {
  store: ScheduleStore;
  onFire: (channelId: string, prompt: string) => Promise<void>;
}): ScheduleRunner {
  const { store, onFire } = deps;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    const now = new Date();
    const due = store.findDue(now);
    for (const entry of due) {
      // 重複発火防止のために先に nextRun を更新
      const next = computeNextRun(entry.pattern, now);
      store.updateNextRun(entry.id, next);

      onFire(entry.channelId, entry.prompt).catch((err: unknown) => {
        process.stderr.write(
          `[schedule-runner] Error firing schedule ${entry.id}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
