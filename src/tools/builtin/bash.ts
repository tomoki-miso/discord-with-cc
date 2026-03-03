import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { OllamaToolDef } from "../types.js";
import { isBashAllowed } from "../security.js";

const execAsync = promisify(exec);

export const BASH_TOOL_DEF: OllamaToolDef = {
  type: "function",
  function: {
    name: "run_bash",
    description: "Execute an allowed shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
      },
      required: ["command"],
    },
  },
};

export async function executeBashTool(
  name: string,
  args: Record<string, unknown>,
  cwd: string,
): Promise<string | null> {
  if (name !== "run_bash") return null;
  const command = args.command as string;
  if (!isBashAllowed(command)) {
    return `Error: Command not allowed: ${command}`;
  }
  const { stdout, stderr } = await execAsync(command, { cwd });
  return stdout + (stderr ? `\nstderr: ${stderr}` : "");
}
