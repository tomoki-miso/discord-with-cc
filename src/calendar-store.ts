import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type CalendarModeChannelState = {
  active?: boolean;
  defaultCalendar?: string;
};

export type CalendarModeState = {
  channels: Record<string, CalendarModeChannelState>;
  globalDefaultCalendar?: string;
};

const DEFAULT_STATE: CalendarModeState = {
  channels: {},
};

export type CalendarModeStoreOptions = {
  filePath?: string;
};

export type CalendarModeStore = {
  isActive(channelId: string): boolean;
  setActive(channelId: string, active: boolean): void;
  getChannelDefaultCalendar(channelId: string): string | undefined;
  setChannelDefaultCalendar(channelId: string, calendarName: string): void;
  clearChannelDefaultCalendar(channelId: string): void;
  setGlobalDefaultCalendar(calendarName: string): void;
  getGlobalDefaultCalendar(): string | undefined;
  getEffectiveCalendar(channelId: string): string | undefined;
  getChannelState(channelId: string): { active: boolean; defaultCalendar?: string };
};

export function createCalendarModeStore(options: CalendarModeStoreOptions = {}): CalendarModeStore {
  let state: CalendarModeState = options.filePath
    ? loadState(options.filePath)
    : { ...DEFAULT_STATE, channels: {} };

  function save(): void {
    if (!options.filePath) return;
    mkdirSync(dirname(options.filePath), { recursive: true });
    writeFileSync(options.filePath, JSON.stringify(state, null, 2) + "\n");
  }

  function ensureChannel(channelId: string): CalendarModeChannelState {
    if (!state.channels[channelId]) {
      state.channels[channelId] = {};
    }
    return state.channels[channelId];
  }

  return {
    isActive(channelId: string) {
      return Boolean(state.channels[channelId]?.active);
    },

    setActive(channelId: string, active: boolean) {
      const channel = ensureChannel(channelId);
      channel.active = active;
      save();
    },

    getChannelDefaultCalendar(channelId: string) {
      return state.channels[channelId]?.defaultCalendar;
    },

    setChannelDefaultCalendar(channelId: string, calendarName: string) {
      const channel = ensureChannel(channelId);
      channel.defaultCalendar = calendarName;
      save();
    },

    clearChannelDefaultCalendar(channelId: string) {
      const channel = ensureChannel(channelId);
      delete channel.defaultCalendar;
      save();
    },

    setGlobalDefaultCalendar(calendarName: string) {
      state.globalDefaultCalendar = calendarName;
      save();
    },

    getGlobalDefaultCalendar() {
      return state.globalDefaultCalendar;
    },

    getEffectiveCalendar(channelId: string) {
      return this.getChannelDefaultCalendar(channelId) ?? state.globalDefaultCalendar;
    },

    getChannelState(channelId: string) {
      const channel = state.channels[channelId] ?? {};
      return {
        active: Boolean(channel.active),
        defaultCalendar: channel.defaultCalendar,
      };
    },
  };
}

function loadState(filePath: string): CalendarModeState {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CalendarModeState;
    if (parsed && typeof parsed === "object" && parsed.channels && typeof parsed.channels === "object") {
      return { channels: parsed.channels, globalDefaultCalendar: parsed.globalDefaultCalendar };
    }
  } catch {
    // ignore read errors and fall through to default
  }
  return { ...DEFAULT_STATE, channels: {} };
}
