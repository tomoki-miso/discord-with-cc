import type { SessionStore } from "./history.js";
import type { ToneStore } from "./tone.js";
import type { AgentHandler } from "./agent.js";
import { buildCliPrompt } from "./prompts.js";
import { runCommand } from "./process.js";

export type GeminiHandlerConfig = {
  cwd: string;
  toneStore: ToneStore;
  sessionStore: SessionStore;
  binary?: string;
  timeoutMs?: number;
};

export function createGeminiHandler(config: GeminiHandlerConfig): AgentHandler {
  const executable = config.binary ?? process.env.GEMINI_BIN ?? "gemini";
  const timeoutMs = config.timeoutMs ?? 5 * 60 * 1000;

  return {
    async ask(prompt: string): Promise<string> {
      try {
        return await executeGeminiQuery({ ...config, executable, timeoutMs }, prompt);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    },
  };
}

async function executeGeminiQuery(
  config: GeminiHandlerConfig & { executable: string; timeoutMs: number },
  prompt: string,
): Promise<string> {
  const tonePrompt = config.toneStore.getSystemPrompt();
  const combinedPrompt = buildCliPrompt(prompt, tonePrompt);

  const args = ["--prompt", combinedPrompt, "--yolo"];

  const result = await runCommand(config.executable, args, {
    cwd: config.cwd,
    timeoutMs: config.timeoutMs,
  });

  if (result.exitCode !== 0) {
    throw new Error(buildCliError("Gemini CLI", result));
  }

  const sanitized = sanitizeGeminiOutput(result.stdout).trim();
  if (sanitized.length > 0) {
    return sanitized;
  }

  throw new Error("Gemini CLI returned an empty response.");
}

function sanitizeGeminiOutput(output: string): string {
  const lines = output.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return true;
    }
    if (trimmed.startsWith("Loading extension:")) {
      return false;
    }
    if (trimmed === "Data collection is disabled.") {
      return false;
    }
    return true;
  });
  return filtered.join("\n");
}

function buildCliError(label: string, result: { stdout: string; stderr: string; exitCode: number }): string {
  const details = result.stderr.trim() || result.stdout.trim() || "unknown error";
  return `${label} exited with code ${result.exitCode}: ${details}`;
}
