import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type TonePreset = {
  name: string;
  prompt: string;
};

const TONE_PRESETS: Record<string, TonePreset> = {
  default: {
    name: "default",
    prompt: "",
  },
  casual: {
    name: "casual",
    prompt:
      "カジュアルでフレンドリーな口調で返答してください。くだけた言葉遣いで、会話するように話してください。",
  },
  formal: {
    name: "formal",
    prompt:
      "丁寧でビジネスライクな口調で返答してください。敬語を使い、プロフェッショナルな言葉遣いを心がけてください。",
  },
  funny: {
    name: "funny",
    prompt:
      "ユーモアたっぷりに返答してください。ウィットに富んだ面白い表現を使いつつ、役に立つ回答を心がけてください。",
  },
};

type ToneState =
  | { type: "preset"; name: string }
  | { type: "custom"; prompt: string };

export type ToneStore = {
  get(): ToneState;
  set(nameOrPrompt: string): void;
  getSystemPrompt(): string;
  listPresets(): string[];
};

export type ToneStoreOptions = {
  filePath?: string;
};

function loadFromFile(filePath: string): ToneState | undefined {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as ToneState;
    if (data.type === "preset" && data.name in TONE_PRESETS) return data;
    if (data.type === "custom" && typeof data.prompt === "string") return data;
  } catch {
    // File doesn't exist or is invalid — use default
  }
  return undefined;
}

function saveToFile(filePath: string, state: ToneState): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
  } catch {
    // Best-effort: log nothing, don't crash the bot
  }
}

export function createToneStore(options: ToneStoreOptions = {}): ToneStore {
  const defaultState: ToneState = { type: "preset", name: "default" };

  let current: ToneState = options.filePath
    ? loadFromFile(options.filePath) ?? defaultState
    : defaultState;

  return {
    get() {
      return current;
    },

    set(nameOrPrompt: string) {
      if (nameOrPrompt in TONE_PRESETS) {
        current = { type: "preset", name: nameOrPrompt };
      } else {
        current = { type: "custom", prompt: nameOrPrompt };
      }
      if (options.filePath) {
        saveToFile(options.filePath, current);
      }
    },

    getSystemPrompt(): string {
      if (current.type === "preset") {
        return TONE_PRESETS[current.name].prompt;
      }
      return current.prompt;
    },

    listPresets(): string[] {
      return Object.keys(TONE_PRESETS);
    },
  };
}
