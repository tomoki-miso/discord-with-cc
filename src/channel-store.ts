import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type ChannelModeState = {
  channels: Record<string, { alwaysOn?: boolean }>;
};

export type ChannelModeStoreOptions = {
  filePath?: string;
};

export type ChannelModeStore = {
  isAlwaysOn(channelId: string): boolean;
  setAlwaysOn(channelId: string, active: boolean): void;
};

const DEFAULT_STATE: ChannelModeState = {
  channels: {},
};

export function createChannelModeStore(options: ChannelModeStoreOptions = {}): ChannelModeStore {
  let state: ChannelModeState = options.filePath
    ? loadState(options.filePath)
    : { ...DEFAULT_STATE, channels: {} };

  function save(): void {
    if (!options.filePath) return;
    mkdirSync(dirname(options.filePath), { recursive: true });
    writeFileSync(options.filePath, JSON.stringify(state, null, 2) + "\n");
  }

  function ensureChannel(channelId: string): { alwaysOn?: boolean } {
    if (!state.channels[channelId]) {
      state.channels[channelId] = {};
    }
    return state.channels[channelId];
  }

  return {
    isAlwaysOn(channelId: string) {
      return Boolean(state.channels[channelId]?.alwaysOn);
    },

    setAlwaysOn(channelId: string, active: boolean) {
      const channel = ensureChannel(channelId);
      channel.alwaysOn = active;
      save();
    },
  };
}

function loadState(filePath: string): ChannelModeState {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as ChannelModeState;
    if (parsed && typeof parsed === "object" && parsed.channels && typeof parsed.channels === "object") {
      return { channels: parsed.channels };
    }
  } catch {
    // ignore read errors and fall through to default
  }
  return { ...DEFAULT_STATE, channels: {} };
}
