import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EventSummary, EventUpdate } from "./calendar-service.js";

// JSON serialization helpers: Date <-> string
type SerializedEventSummary = Omit<EventSummary, "start" | "end"> & { start: string; end: string };
type SerializedEventUpdate = Omit<EventUpdate, "start" | "end"> & { start?: string; end?: string };

export type PendingOperation =
  | { type: "select_candidate"; opType: "delete" | "update"; candidates: EventSummary[]; updateData?: Partial<EventUpdate> }
  | { type: "confirm_delete"; selectedEvent: EventSummary }
  | { type: "confirm_update"; selectedEvent: EventSummary; updateData: Partial<EventUpdate> };

type SerializedPendingOperation =
  | { type: "select_candidate"; opType: "delete" | "update"; candidates: SerializedEventSummary[]; updateData?: Partial<SerializedEventUpdate> }
  | { type: "confirm_delete"; selectedEvent: SerializedEventSummary }
  | { type: "confirm_update"; selectedEvent: SerializedEventSummary; updateData: Partial<SerializedEventUpdate> };

function serializeEventSummary(e: EventSummary): SerializedEventSummary {
  return { ...e, start: e.start.toISOString(), end: e.end.toISOString() };
}

function deserializeEventSummary(e: SerializedEventSummary): EventSummary {
  return { ...e, start: new Date(e.start), end: new Date(e.end) };
}

function serializeEventUpdate(u: Partial<EventUpdate>): Partial<SerializedEventUpdate> {
  const result: Partial<SerializedEventUpdate> = {};
  if (u.title !== undefined) result.title = u.title;
  if (u.location !== undefined) result.location = u.location;
  if (u.description !== undefined) result.description = u.description;
  if (u.start !== undefined) result.start = u.start.toISOString();
  if (u.end !== undefined) result.end = u.end.toISOString();
  return result;
}

function deserializeEventUpdate(u: Partial<SerializedEventUpdate>): Partial<EventUpdate> {
  const result: Partial<EventUpdate> = {};
  if (u.title !== undefined) result.title = u.title;
  if (u.location !== undefined) result.location = u.location;
  if (u.description !== undefined) result.description = u.description;
  if (u.start !== undefined) result.start = new Date(u.start);
  if (u.end !== undefined) result.end = new Date(u.end);
  return result;
}

function serializePendingOperation(op: PendingOperation): SerializedPendingOperation {
  if (op.type === "select_candidate") {
    return {
      type: "select_candidate",
      opType: op.opType,
      candidates: op.candidates.map(serializeEventSummary),
      updateData: op.updateData ? serializeEventUpdate(op.updateData) : undefined,
    };
  } else if (op.type === "confirm_delete") {
    return { type: "confirm_delete", selectedEvent: serializeEventSummary(op.selectedEvent) };
  } else {
    return {
      type: "confirm_update",
      selectedEvent: serializeEventSummary(op.selectedEvent),
      updateData: serializeEventUpdate(op.updateData),
    };
  }
}

function deserializePendingOperation(op: SerializedPendingOperation): PendingOperation {
  if (op.type === "select_candidate") {
    return {
      type: "select_candidate",
      opType: op.opType,
      candidates: op.candidates.map(deserializeEventSummary),
      updateData: op.updateData ? deserializeEventUpdate(op.updateData) : undefined,
    };
  } else if (op.type === "confirm_delete") {
    return { type: "confirm_delete", selectedEvent: deserializeEventSummary(op.selectedEvent) };
  } else {
    return {
      type: "confirm_update",
      selectedEvent: deserializeEventSummary(op.selectedEvent),
      updateData: deserializeEventUpdate(op.updateData),
    };
  }
}

export type CalendarModeChannelState = {
  active?: boolean;
  defaultCalendar?: string;
  pendingOperation?: SerializedPendingOperation;
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
  getPendingOperation(channelId: string): PendingOperation | undefined;
  setPendingOperation(channelId: string, op: PendingOperation): void;
  clearPendingOperation(channelId: string): void;
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

    getPendingOperation(channelId: string) {
      const serialized = state.channels[channelId]?.pendingOperation;
      if (!serialized) return undefined;
      return deserializePendingOperation(serialized);
    },

    setPendingOperation(channelId: string, op: PendingOperation) {
      const channel = ensureChannel(channelId);
      channel.pendingOperation = serializePendingOperation(op);
      save();
    },

    clearPendingOperation(channelId: string) {
      const channel = state.channels[channelId];
      if (channel) {
        delete channel.pendingOperation;
        save();
      }
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
