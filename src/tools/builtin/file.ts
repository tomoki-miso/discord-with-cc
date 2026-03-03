import { readFile, writeFile } from "node:fs/promises";
import type { OllamaToolDef } from "../types.js";

export const FILE_TOOL_DEFS: OllamaToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a file from the filesystem",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The absolute or relative file path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates or overwrites the file)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path to write to" },
          content: { type: "string", description: "The content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing an exact string with a new string",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path to edit" },
          old_string: { type: "string", description: "The exact string to replace" },
          new_string: { type: "string", description: "The replacement string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
];

export async function executeFileTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  switch (name) {
    case "read_file": {
      const path = args.path as string;
      if (/\.env/.test(path)) return "Error: Access to .env files is denied";
      return await readFile(path, "utf-8");
    }

    case "write_file": {
      const path = args.path as string;
      if (/\.env/.test(path)) return "Error: Access to .env files is denied";
      await writeFile(path, args.content as string, "utf-8");
      return `Successfully wrote to ${path}`;
    }

    case "edit_file": {
      const path = args.path as string;
      if (/\.env/.test(path)) return "Error: Access to .env files is denied";
      const original = await readFile(path, "utf-8");
      const oldString = args.old_string as string;
      if (!original.includes(oldString)) {
        return `Error: The string to replace was not found in ${path}`;
      }
      await writeFile(path, original.replace(oldString, args.new_string as string), "utf-8");
      return `Successfully edited ${path}`;
    }

    default:
      return null;
  }
}
