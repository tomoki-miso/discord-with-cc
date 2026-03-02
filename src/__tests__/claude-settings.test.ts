import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALLOWED_TOOLS, DISALLOWED_TOOLS } from "../permissions.js";

type ClaudeSettings = {
  permissions: {
    allow: string[];
    deny: string[];
  };
};

const SETTINGS_PATH = resolve(process.cwd(), ".claude/settings.json");

function loadSettings(): ClaudeSettings {
  const content = readFileSync(SETTINGS_PATH, "utf-8");
  return JSON.parse(content) as ClaudeSettings;
}

describe(".claude/settings.json", () => {
  it("should be a valid JSON file with permissions structure", () => {
    // Given/When: reading the settings file
    const settings = loadSettings();

    // Then: has permissions with allow and deny arrays
    expect(settings).toHaveProperty("permissions");
    expect(Array.isArray(settings.permissions.allow)).toBe(true);
    expect(Array.isArray(settings.permissions.deny)).toBe(true);
  });

  describe("sync with permissions.ts", () => {
    it("should have allow list matching ALLOWED_TOOLS", () => {
      // Given: settings and shared constants
      const settings = loadSettings();

      // When/Then: settings allow matches ALLOWED_TOOLS
      expect([...settings.permissions.allow].sort()).toEqual(
        [...ALLOWED_TOOLS].sort(),
      );
    });

    it("should have deny list matching DISALLOWED_TOOLS", () => {
      // Given: settings and shared constants
      const settings = loadSettings();

      // When/Then: settings deny matches DISALLOWED_TOOLS
      expect([...settings.permissions.deny].sort()).toEqual(
        [...DISALLOWED_TOOLS].sort(),
      );
    });
  });

  describe("deny rules", () => {
    it("should deny reading .env files", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny includes .env read restrictions
      expect(settings.permissions.deny).toContain("Read(.env)");
      expect(settings.permissions.deny).toContain("Read(.env.*)");
    });

    it("should deny editing .env files", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny includes .env edit restrictions
      expect(settings.permissions.deny).toContain("Edit(.env)");
      expect(settings.permissions.deny).toContain("Edit(.env.*)");
    });

    it("should deny writing .env files", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny includes .env write restrictions
      expect(settings.permissions.deny).toContain("Write(.env)");
      expect(settings.permissions.deny).toContain("Write(.env.*)");
    });

    it("should deny bash access to .env files", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny blocks bash commands that could read .env
      expect(settings.permissions.deny).toContain("Bash(cat .env*)");
      expect(settings.permissions.deny).toContain("Bash(head .env*)");
      expect(settings.permissions.deny).toContain("Bash(tail .env*)");
      expect(settings.permissions.deny).toContain("Bash(grep * .env*)");
    });

    it("should deny recursive file deletion", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny includes rm -rf
      expect(settings.permissions.deny).toContain("Bash(rm -rf *)");
    });

    it("should deny git push", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny includes git push
      expect(settings.permissions.deny).toContain("Bash(git push *)");
    });

    it("should deny external network commands", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: deny includes curl and wget
      expect(settings.permissions.deny).toContain("Bash(curl *)");
      expect(settings.permissions.deny).toContain("Bash(wget *)");
    });
  });

  describe("allow rules", () => {
    it("should allow npm development commands", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: allow includes npm run
      expect(settings.permissions.allow).toContain("Bash(npm run *)");
    });

    it("should allow TypeScript and test tooling commands", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: allow includes tsc and vitest
      expect(settings.permissions.allow).toContain("Bash(npx tsc *)");
      expect(settings.permissions.allow).toContain("Bash(npx vitest *)");
    });

    it("should allow safe git operations", () => {
      // Given: settings loaded
      const settings = loadSettings();
      const allow = settings.permissions.allow;

      // When/Then: allow includes safe git commands
      expect(allow).toContain("Bash(git status)");
      expect(allow).toContain("Bash(git diff *)");
      expect(allow).toContain("Bash(git log *)");
      expect(allow).toContain("Bash(git add *)");
      expect(allow).toContain("Bash(git commit *)");
    });

    it("should not include git push in allow rules", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: allow does NOT include git push
      const hasPush = settings.permissions.allow.some((rule: string) =>
        rule.includes("git push"),
      );
      expect(hasPush).toBe(false);
    });

    it("should not include destructive delete commands in allow rules", () => {
      // Given: settings loaded
      const settings = loadSettings();

      // When/Then: allow does NOT include rm -rf
      const hasRmRf = settings.permissions.allow.some((rule: string) =>
        rule.includes("rm -rf"),
      );
      expect(hasRmRf).toBe(false);
    });
  });
});
