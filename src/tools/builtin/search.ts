import { exec } from "node:child_process";
import { promisify } from "node:util";
import { glob } from "tinyglobby";
import type { OllamaToolDef } from "../types.js";

const execAsync = promisify(exec);

export const SEARCH_TOOL_DEFS: OllamaToolDef[] = [
  {
    type: "function",
    function: {
      name: "glob_files",
      description: "List files matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The glob pattern (e.g., **/*.ts)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_files",
      description: "Search for a regex pattern in files",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The regex pattern to search for" },
          path: {
            type: "string",
            description: "Directory or file to search in (optional, defaults to current directory)",
          },
        },
        required: ["pattern"],
      },
    },
  },
];

export async function executeSearchTool(
  name: string,
  args: Record<string, unknown>,
  cwd: string,
): Promise<string | null> {
  switch (name) {
    case "glob_files": {
      const results = await glob(args.pattern as string, { cwd });
      return results.join("\n") || "No files found";
    }

    case "grep_files": {
      const searchPath = (args.path as string | undefined) ?? ".";
      const escapedPattern = (args.pattern as string).replace(/"/g, '\\"');
      const escapedPath = searchPath.replace(/"/g, '\\"');
      const { stdout } = await execAsync(
        `grep -rn "${escapedPattern}" "${escapedPath}"`,
        { cwd },
      );
      return stdout || "No matches found";
    }

    default:
      return null;
  }
}
