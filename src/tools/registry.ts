import type { OllamaToolDef } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, OllamaToolDef>();
  private executors = new Map<string, (args: Record<string, unknown>) => Promise<string>>();

  register(
    def: OllamaToolDef,
    executor: (args: Record<string, unknown>) => Promise<string>,
  ): void {
    this.tools.set(def.function.name, def);
    this.executors.set(def.function.name, executor);
  }

  registerAll(
    defs: OllamaToolDef[],
    executor: (name: string, args: Record<string, unknown>) => Promise<string | null>,
  ): void {
    for (const def of defs) {
      this.tools.set(def.function.name, def);
      this.executors.set(def.function.name, async (args) => {
        const result = await executor(def.function.name, args);
        return result ?? `Error: Unknown tool: ${def.function.name}`;
      });
    }
  }

  getDefinitions(): OllamaToolDef[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const executor = this.executors.get(name);
    if (!executor) {
      return `Error: Unknown tool: ${name}`;
    }
    try {
      return await executor(args);
    } catch (err) {
      return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  has(name: string): boolean {
    return this.executors.has(name);
  }
}
