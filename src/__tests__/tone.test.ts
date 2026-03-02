import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

  describe("file persistence", () => {
    const testDir = join(tmpdir(), `tone-test-${process.pid}`);
    const testFile = join(testDir, "tone.json");

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it("should save tone to file when filePath is provided", () => {
      // Given: a store with a file path
      const store = createToneStore({ filePath: testFile });

      // When: setting a preset
      store.set("casual");

      // Then: the file is written with the tone state
      expect(existsSync(testFile)).toBe(true);
      const saved = JSON.parse(readFileSync(testFile, "utf-8"));
      expect(saved).toEqual({ type: "preset", name: "casual" });
    });

    it("should load tone from file on creation", () => {
      // Given: a file with a saved tone
      mkdirSync(testDir, { recursive: true });
      const store1 = createToneStore({ filePath: testFile });
      store1.set("formal");

      // When: creating a new store with the same file path
      const store2 = createToneStore({ filePath: testFile });

      // Then: it loads the saved tone
      expect(store2.get()).toEqual({ type: "preset", name: "formal" });
    });

    it("should persist custom tone across instances", () => {
      // Given: a store that saves a custom tone
      const store1 = createToneStore({ filePath: testFile });
      store1.set("海賊のように話してください");

      // When: creating a new store with the same file path
      const store2 = createToneStore({ filePath: testFile });

      // Then: the custom tone is restored
      expect(store2.get()).toEqual({ type: "custom", prompt: "海賊のように話してください" });
      expect(store2.getSystemPrompt()).toBe("海賊のように話してください");
    });

    it("should default when file does not exist", () => {
      // Given: no file exists at the path
      const store = createToneStore({ filePath: testFile });

      // When/Then: defaults to default preset
      expect(store.get()).toEqual({ type: "preset", name: "default" });
    });

    it("should default when file contains invalid JSON", () => {
      // Given: a file with invalid content
      mkdirSync(testDir, { recursive: true });
      const { writeFileSync } = require("node:fs");
      writeFileSync(testFile, "not json");

      // When: creating a store with that file path
      const store = createToneStore({ filePath: testFile });

      // Then: defaults to default preset
      expect(store.get()).toEqual({ type: "preset", name: "default" });
    });

    it("should not write file when filePath is not provided", () => {
      // Given: a store without a file path
      const store = createToneStore();

      // When: setting a tone
      store.set("casual");

      // Then: no file is created at the test path
      expect(existsSync(testFile)).toBe(false);
    });
  });
});
