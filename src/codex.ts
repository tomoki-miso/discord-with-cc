import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionStore } from "./history.js";
import type { ToneStore } from "./tone.js";
import type { AgentHandler } from "./agent.js";
import { buildCliPrompt } from "./prompts.js";
import { runCommand } from "./process.js";

export type CodexHandlerConfig = {
  cwd: string;
  toneStore: ToneStore;
  sessionStore: SessionStore;
  binary?: string;
  timeoutMs?: number;
};

export function createCodexHandler(config: CodexHandlerConfig): AgentHandler {
  const executable = config.binary ?? process.env.CODEX_BIN ?? "codex";
  const timeoutMs = config.timeoutMs ?? 5 * 60 * 1000;

  return {
    async ask(prompt: string): Promise<string> {
      try {
        return await executeCodexQuery({ ...config, executable, timeoutMs }, prompt);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    },
  };
}

async function executeCodexQuery(
  config: CodexHandlerConfig & { executable: string; timeoutMs: number },
  prompt: string,
): Promise<string> {
  const tonePrompt = config.toneStore.getSystemPrompt();
  const combinedPrompt = buildCliPrompt(prompt, tonePrompt);

  const tempDir = await mkdtemp(join(tmpdir(), "codex-"));
  const outputFile = join(tempDir, "last-message.txt");

  try {
    const args = [
      "exec",
      "--full-auto",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--output-last-message",
      outputFile,
      "--cd",
      config.cwd,
      combinedPrompt,
    ];

    const result = await runCommand(config.executable, args, {
      cwd: config.cwd,
      timeoutMs: config.timeoutMs,
    });

    if (result.exitCode !== 0) {
      throw new Error(buildCliError("Codex CLI", result));
    }

    const fileContents = await safeReadFile(outputFile);
    if (fileContents.trim().length > 0) {
      return fileContents.trim();
    }

    const stdout = result.stdout.trim();
    if (stdout.length > 0) {
      return stdout;
    }

    throw new Error("Codex CLI returned an empty response.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function safeReadFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

function buildCliError(label: string, result: { stdout: string; stderr: string; exitCode: number }): string {
  const details = result.stderr.trim() || result.stdout.trim() || "unknown error";
  return `${label} exited with code ${result.exitCode}: ${details}`;
}
