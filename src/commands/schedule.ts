import { randomUUID } from "node:crypto";
import { parseScheduleExpression, computeNextRun } from "../schedule-parser.js";
import type { ScheduleStore } from "../schedule-store.js";

export function handleScheduleCommand(
  sub: string,
  options: { expression?: string; prompt?: string; id?: string },
  channelId: string,
  deps: { store: ScheduleStore },
): string {
  const { store } = deps;

  if (sub === "add") {
    const { expression, prompt } = options;
    if (!expression || !prompt) {
      return "expression と prompt の両方が必要です。";
    }
    const pattern = parseScheduleExpression(expression);
    if (!pattern) {
      return `「${expression}」をスケジュールとして解釈できませんでした。例: 「毎朝9時」「毎週月曜12時」`;
    }
    const now = new Date();
    const entry = {
      id: randomUUID(),
      channelId,
      prompt,
      expression,
      pattern,
      nextRun: computeNextRun(pattern, now).toISOString(),
      createdAt: now.toISOString(),
    };
    store.add(entry);
    return `スケジュールを登録しました。\nID: \`${entry.id.slice(0, 8)}\`\n式: ${expression}\n次回実行: ${new Date(entry.nextRun).toLocaleString("ja-JP")}`;
  }

  if (sub === "list") {
    const entries = store.list().filter((e) => e.channelId === channelId);
    if (entries.length === 0) {
      return "このチャンネルにスケジュールはありません。";
    }
    const lines = entries.map((e) =>
      `\`${e.id.slice(0, 8)}\` | ${e.expression} | 次回: ${new Date(e.nextRun).toLocaleString("ja-JP")}\n　プロンプト: ${e.prompt}`,
    );
    return `スケジュール一覧 (${entries.length}件):\n${lines.join("\n")}`;
  }

  if (sub === "delete") {
    const { id } = options;
    if (!id) return "削除するスケジュールの ID を指定してください。";

    const entries = store.list();
    // ID prefix マッチ（他チャンネルは削除不可）
    const target = entries.find(
      (e) => e.id.startsWith(id) && e.channelId === channelId,
    );
    if (!target) {
      return `ID \`${id}\` のスケジュールがこのチャンネルに見つかりません。`;
    }
    store.remove(target.id);
    return `スケジュール \`${id}\` を削除しました。`;
  }

  return `不明なサブコマンド: ${sub}`;
}
