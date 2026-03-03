import type { ToneStore } from "../tone.js";
import type { createSessionStore } from "../history.js";

type ToneCommandDeps = {
  toneStore: ToneStore;
  sessionStore: ReturnType<typeof createSessionStore>;
};

export function handleToneCommand(args: string, deps: ToneCommandDeps): string {
  if (args === "") {
    const current = deps.toneStore.get();
    const presets = deps.toneStore.listPresets().join(", ");
    const currentLabel =
      current.type === "preset" ? current.name : `カスタム: "${current.prompt}"`;
    return `現在のトーン: ${currentLabel}\n利用可能なプリセット: ${presets}\n使い方: !tone <プリセット名> | !tone set <テキスト> | !tone reset`;
  }

  if (args === "reset") {
    deps.toneStore.set("default");
    deps.sessionStore.clear();
    return "トーンをデフォルトにリセットしました。";
  }

  if (args.startsWith("set ")) {
    const customPrompt = args.slice("set ".length).trim();
    if (!customPrompt) {
      return "カスタムプロンプトを入力してください。使い方: !tone set <テキスト>";
    }
    deps.toneStore.set(customPrompt);
    deps.sessionStore.clear();
    return "カスタムトーンを設定しました。セッションをクリアしました。";
  }

  const presetName = args;
  const presets = deps.toneStore.listPresets();
  if (!presets.includes(presetName)) {
    return `不明なプリセット「${presetName}」です。利用可能: ${presets.join(", ")}`;
  }

  deps.toneStore.set(presetName);
  deps.sessionStore.clear();
  return `トーンを「${presetName}」に変更しました。セッションをクリアしました。`;
}

export function createToneCommand(deps: ToneCommandDeps) {
  return function handle(args: string, _channelId: string): string {
    return handleToneCommand(args, deps);
  };
}
