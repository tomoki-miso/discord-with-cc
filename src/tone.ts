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

export type ToneStore = {
  get(): { type: "preset"; name: string } | { type: "custom"; prompt: string };
  set(nameOrPrompt: string): void;
  getSystemPrompt(): string;
  listPresets(): string[];
};

export function createToneStore(): ToneStore {
  let current: { type: "preset"; name: string } | { type: "custom"; prompt: string } = {
    type: "preset",
    name: "default",
  };

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
