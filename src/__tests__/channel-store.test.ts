import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChannelModeStore } from "../channel-store.js";

describe("createChannelModeStore", () => {
  it("returns false for unknown channels", () => {
    // Given: a fresh store
    const store = createChannelModeStore();

    // When/Then: unknown channel is not always-on
    expect(store.isAlwaysOn("unknown-channel")).toBe(false);
  });

  it("activates always-on mode for a channel", () => {
    // Given: a store
    const store = createChannelModeStore();

    // When: setting always-on to true
    store.setAlwaysOn("channel-1", true);

    // Then: isAlwaysOn returns true
    expect(store.isAlwaysOn("channel-1")).toBe(true);
  });

  it("deactivates always-on mode for a channel", () => {
    // Given: a store with channel-1 active
    const store = createChannelModeStore();
    store.setAlwaysOn("channel-1", true);

    // When: setting always-on to false
    store.setAlwaysOn("channel-1", false);

    // Then: isAlwaysOn returns false
    expect(store.isAlwaysOn("channel-1")).toBe(false);
  });

  it("persists state to disk when filePath is provided", () => {
    // Given: a temp directory and file path
    const dir = mkdtempSync(join(tmpdir(), "channel-store-"));
    const filePath = join(dir, "channel-mode.json");

    // When: setting always-on and creating a new store from same file
    const storeA = createChannelModeStore({ filePath });
    storeA.setAlwaysOn("channel-x", true);

    const raw = readFileSync(filePath, "utf-8");
    expect(raw).toContain("channel-x");

    const storeB = createChannelModeStore({ filePath });
    expect(storeB.isAlwaysOn("channel-x")).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("returns false after reload when set to false", () => {
    // Given: a temp directory
    const dir = mkdtempSync(join(tmpdir(), "channel-store-"));
    const filePath = join(dir, "channel-mode.json");

    // When: activating then deactivating, then reloading
    const storeA = createChannelModeStore({ filePath });
    storeA.setAlwaysOn("channel-y", true);
    storeA.setAlwaysOn("channel-y", false);

    const storeB = createChannelModeStore({ filePath });
    expect(storeB.isAlwaysOn("channel-y")).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});
