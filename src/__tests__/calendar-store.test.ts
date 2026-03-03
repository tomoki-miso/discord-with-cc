import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCalendarModeStore } from "../calendar-store.js";

describe("createCalendarModeStore", () => {
  it("activates channels and stores defaults", () => {
    const store = createCalendarModeStore();
    store.setActive("channel-1", true);
    store.setChannelDefaultCalendar("channel-1", "自宅");

    expect(store.isActive("channel-1")).toBe(true);
    expect(store.getEffectiveCalendar("channel-1")).toBe("自宅");
  });

  it("falls back to global default when channel not set", () => {
    const store = createCalendarModeStore();
    store.setGlobalDefaultCalendar("仕事");
    expect(store.getEffectiveCalendar("unknown")).toBe("仕事");
  });

  it("persists state to disk when filePath is provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "calendar-store-"));
    const filePath = join(dir, "state.json");

    const storeA = createCalendarModeStore({ filePath });
    storeA.setActive("channel-x", true);
    storeA.setChannelDefaultCalendar("channel-x", "Home");
    storeA.setGlobalDefaultCalendar("Global");

    const raw = readFileSync(filePath, "utf-8");
    expect(raw).toContain("Home");
    expect(raw).toContain("Global");

    const storeB = createCalendarModeStore({ filePath });
    expect(storeB.isActive("channel-x")).toBe(true);
    expect(storeB.getChannelDefaultCalendar("channel-x")).toBe("Home");
    expect(storeB.getGlobalDefaultCalendar()).toBe("Global");

    rmSync(dir, { recursive: true, force: true });
  });
});
