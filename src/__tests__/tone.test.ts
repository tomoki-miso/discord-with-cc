import { describe, it, expect } from "vitest";
import { createToneStore } from "../tone.js";

describe("createToneStore", () => {
  describe("initial state", () => {
    it("should default to 'default' preset", () => {
      // Given: a fresh tone store
      const store = createToneStore();

      // When: getting the current tone
      const tone = store.get();

      // Then: it is the default preset
      expect(tone).toEqual({ type: "preset", name: "default" });
    });

    it("should return empty system prompt for default preset", () => {
      // Given: a fresh tone store
      const store = createToneStore();

      // When: getting the system prompt
      const prompt = store.getSystemPrompt();

      // Then: it is an empty string
      expect(prompt).toBe("");
    });
  });

  describe("preset management", () => {
    it("should list all available presets", () => {
      // Given: a tone store
      const store = createToneStore();

      // When: listing presets
      const presets = store.listPresets();

      // Then: all four presets are listed
      expect(presets).toContain("default");
      expect(presets).toContain("casual");
      expect(presets).toContain("formal");
      expect(presets).toContain("funny");
      expect(presets).toHaveLength(4);
    });

    it("should switch to a preset by name", () => {
      // Given: a tone store
      const store = createToneStore();

      // When: setting to casual preset
      store.set("casual");

      // Then: current tone is the casual preset
      expect(store.get()).toEqual({ type: "preset", name: "casual" });
    });

    it("should return non-empty system prompt for non-default preset", () => {
      // Given: a tone store set to casual
      const store = createToneStore();
      store.set("casual");

      // When: getting the system prompt
      const prompt = store.getSystemPrompt();

      // Then: it contains tone instructions in Japanese
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("カジュアル");
    });

    it("should return different prompts for different presets", () => {
      // Given: a tone store
      const store = createToneStore();

      // When: getting prompts for each preset
      store.set("casual");
      const casualPrompt = store.getSystemPrompt();
      store.set("formal");
      const formalPrompt = store.getSystemPrompt();
      store.set("funny");
      const funnyPrompt = store.getSystemPrompt();

      // Then: each prompt is unique
      expect(casualPrompt).not.toBe(formalPrompt);
      expect(formalPrompt).not.toBe(funnyPrompt);
      expect(casualPrompt).not.toBe(funnyPrompt);
    });
  });

  describe("custom tone", () => {
    it("should set a custom prompt when name is not a preset", () => {
      // Given: a tone store
      const store = createToneStore();

      // When: setting a custom tone
      store.set("Respond like a pirate");

      // Then: it is stored as a custom tone
      expect(store.get()).toEqual({
        type: "custom",
        prompt: "Respond like a pirate",
      });
    });

    it("should return custom text as system prompt", () => {
      // Given: a tone store with custom tone
      const store = createToneStore();
      store.set("Respond like a pirate");

      // When: getting the system prompt
      const prompt = store.getSystemPrompt();

      // Then: it returns the custom text
      expect(prompt).toBe("Respond like a pirate");
    });

    it("should allow switching from custom back to preset", () => {
      // Given: a store with a custom tone
      const store = createToneStore();
      store.set("custom text");

      // When: switching to a preset
      store.set("formal");

      // Then: it is now a preset
      expect(store.get()).toEqual({ type: "preset", name: "formal" });
    });
  });

  describe("state isolation", () => {
    it("should isolate state between instances", () => {
      // Given: two separate store instances
      const store1 = createToneStore();
      const store2 = createToneStore();

      // When: setting tone in one store
      store1.set("casual");

      // Then: the other store is not affected
      expect(store2.get()).toEqual({ type: "preset", name: "default" });
    });
  });
});
