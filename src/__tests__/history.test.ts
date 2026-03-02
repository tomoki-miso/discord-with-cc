import { describe, it, expect } from "vitest";
import { createSessionStore } from "../history.js";

describe("createSessionStore", () => {
  it("should return undefined when channel has no session", () => {
    // Given: a fresh session store
    const store = createSessionStore();

    // When: getting a session for a channel that was never set
    const result = store.get("channel-1");

    // Then: returns undefined
    expect(result).toBeUndefined();
  });

  it("should store and retrieve a session ID", () => {
    // Given: a store with a session set
    const store = createSessionStore();
    store.set("channel-1", "session-abc");

    // When: retrieving the session
    const result = store.get("channel-1");

    // Then: returns the stored session ID
    expect(result).toBe("session-abc");
  });

  it("should overwrite existing session ID for the same channel", () => {
    // Given: a store with an existing session
    const store = createSessionStore();
    store.set("channel-1", "session-old");

    // When: setting a new session for the same channel
    store.set("channel-1", "session-new");

    // Then: returns the new session ID
    expect(store.get("channel-1")).toBe("session-new");
  });

  it("should isolate state between instances", () => {
    // Given: two separate store instances
    const store1 = createSessionStore();
    const store2 = createSessionStore();

    // When: setting a session in one store
    store1.set("channel-1", "session-abc");

    // Then: the other store is not affected
    expect(store2.get("channel-1")).toBeUndefined();
  });

  it("should manage multiple channels independently", () => {
    // Given: a store with sessions for two channels
    const store = createSessionStore();
    store.set("channel-1", "session-aaa");
    store.set("channel-2", "session-bbb");

    // When/Then: each channel returns its own session
    expect(store.get("channel-1")).toBe("session-aaa");
    expect(store.get("channel-2")).toBe("session-bbb");
  });
});
