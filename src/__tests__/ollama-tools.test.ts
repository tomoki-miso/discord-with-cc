import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- MCP SDK mocks ----
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockResolvedValue({ tools: [] });
const mockCallTool = vi.fn().mockResolvedValue({ content: [] });
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    listTools: mockListTools,
    callTool: mockCallTool,
    close: mockClose,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

// ---- fs/promises mocks ----
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockGlob = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  glob: (...args: unknown[]) => mockGlob(...args),
}));

// ---- child_process mocks ----
// Use vi.hoisted so the variable is available inside the vi.mock factory (which is hoisted)
const mockExecImpl = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  // Attach util.promisify.custom so that promisify(exec) returns { stdout, stderr }
  exec: Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: (cmd: string, opts: unknown) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        mockExecImpl(cmd, opts, (err: Error | null, stdout: string, stderr: string) => {
          if (err) reject(err);
          else resolve({ stdout, stderr });
        });
      }),
  }),
}));

import { createOllamaToolManager, isBashAllowed } from "../ollama-tools.js";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

const STDIO_SERVER: McpServerConfig = {
  type: "stdio",
  command: "bunx",
  args: ["--no-cache", "apple-mcp@latest"],
};

const HTTP_SERVER: McpServerConfig = {
  type: "http",
  url: "https://mcp.slack.com/mcp",
};

function makeConfig(mcpServers: Record<string, McpServerConfig> = {}) {
  return { mcpServers, cwd: "/test" };
}

// Helper: make mockGlob return an async iterable of paths
function mockGlobReturning(paths: string[]) {
  mockGlob.mockImplementation(async function* () {
    for (const p of paths) yield p;
  });
}

// Helper: make mockExecImpl call its callback with stdout
function mockExecReturning(stdout: string, stderr = "") {
  mockExecImpl.mockImplementation(
    (_cmd: string, _opts: unknown, cb: (err: Error | null, out: string, err2: string) => void) => {
      cb(null, stdout, stderr);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(undefined);
  mockListTools.mockResolvedValue({ tools: [] });
  mockCallTool.mockResolvedValue({ content: [] });
  mockClose.mockResolvedValue(undefined);
});

// ---- isBashAllowed ----
describe("isBashAllowed", () => {
  it("allows npm run commands", () => {
    expect(isBashAllowed("npm run test")).toBe(true);
  });

  it("allows git status", () => {
    expect(isBashAllowed("git status")).toBe(true);
  });

  it("allows ls with arguments", () => {
    expect(isBashAllowed("ls -la")).toBe(true);
  });

  it("denies rm -rf", () => {
    expect(isBashAllowed("rm -rf /")).toBe(false);
  });

  it("denies git push", () => {
    expect(isBashAllowed("git push origin main")).toBe(false);
  });

  it("denies commands accessing .env files", () => {
    expect(isBashAllowed("cat .env")).toBe(false);
  });

  it("denies curl", () => {
    expect(isBashAllowed("curl https://example.com")).toBe(false);
  });

  it("denies unknown commands", () => {
    expect(isBashAllowed("python3 evil.py")).toBe(false);
  });
});

// ---- getTools ----
describe("createOllamaToolManager", () => {
  describe("getTools", () => {
    it("returns all 7 built-in tools when no MCP servers are configured", async () => {
      // Given: no MCP servers
      const manager = createOllamaToolManager(makeConfig());

      // When: listing tools
      const tools = await manager.getTools();

      // Then: all built-in tool names are present
      const names = tools.map((t) => t.function.name);
      expect(names).toContain("read_file");
      expect(names).toContain("write_file");
      expect(names).toContain("edit_file");
      expect(names).toContain("run_bash");
      expect(names).toContain("glob_files");
      expect(names).toContain("grep_files");
      expect(names).toContain("web_fetch");
      expect(tools).toHaveLength(7);
    });

    it("appends MCP tools with mcp__server__name prefix", async () => {
      // Given: an apple-mcp stdio server that lists one tool
      mockListTools.mockResolvedValue({
        tools: [
          {
            name: "notes_search",
            description: "Search notes",
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        ],
      });
      const manager = createOllamaToolManager(makeConfig({ "apple-mcp": STDIO_SERVER }));

      // When: listing tools
      const tools = await manager.getTools();

      // Then: the MCP tool is included with sanitized prefix (hyphen → underscore)
      const mcpTool = tools.find((t) => t.function.name === "mcp__apple_mcp__notes_search");
      expect(mcpTool).toBeDefined();
      expect(mcpTool?.function.description).toBe("Search notes");
    });

    it("skips MCP server on connection failure and still returns built-in tools", async () => {
      // Given: connect throws
      mockConnect.mockRejectedValue(new Error("connection refused"));
      const manager = createOllamaToolManager(makeConfig({ "apple-mcp": STDIO_SERVER }));

      // When: listing tools
      const tools = await manager.getTools();

      // Then: only built-in tools are returned (no MCP tools)
      expect(tools).toHaveLength(7);
      expect(tools.every((t) => !t.function.name.startsWith("mcp__"))).toBe(true);
    });

    it("caches tools after first call", async () => {
      // Given: a manager with no MCP servers
      const manager = createOllamaToolManager(makeConfig());

      // When: getTools is called twice
      const first = await manager.getTools();
      const second = await manager.getTools();

      // Then: returns the same array reference (cached)
      expect(first).toBe(second);
    });
  });

  // ---- executeTool: built-ins ----
  describe("executeTool - read_file", () => {
    it("reads and returns file content", async () => {
      // Given
      mockReadFile.mockResolvedValue("file content here");
      const manager = createOllamaToolManager(makeConfig());

      // When
      const result = await manager.executeTool("read_file", { path: "src/foo.ts" });

      // Then
      expect(result).toBe("file content here");
      expect(mockReadFile).toHaveBeenCalledWith("src/foo.ts", "utf-8");
    });

    it("blocks access to .env files", async () => {
      const manager = createOllamaToolManager(makeConfig());
      const result = await manager.executeTool("read_file", { path: ".env.dev" });
      expect(result).toMatch(/denied/i);
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  describe("executeTool - write_file", () => {
    it("writes content to a file", async () => {
      mockWriteFile.mockResolvedValue(undefined);
      const manager = createOllamaToolManager(makeConfig());

      const result = await manager.executeTool("write_file", { path: "out.txt", content: "hello" });

      expect(result).toMatch(/successfully/i);
      expect(mockWriteFile).toHaveBeenCalledWith("out.txt", "hello", "utf-8");
    });
  });

  describe("executeTool - edit_file", () => {
    it("replaces old_string with new_string in file", async () => {
      mockReadFile.mockResolvedValue("Hello world");
      mockWriteFile.mockResolvedValue(undefined);
      const manager = createOllamaToolManager(makeConfig());

      const result = await manager.executeTool("edit_file", {
        path: "file.ts",
        old_string: "world",
        new_string: "there",
      });

      expect(result).toMatch(/successfully/i);
      expect(mockWriteFile).toHaveBeenCalledWith("file.ts", "Hello there", "utf-8");
    });

    it("returns error when old_string is not found", async () => {
      mockReadFile.mockResolvedValue("Hello world");
      const manager = createOllamaToolManager(makeConfig());

      const result = await manager.executeTool("edit_file", {
        path: "file.ts",
        old_string: "missing",
        new_string: "new",
      });

      expect(result).toMatch(/not found/i);
    });
  });

  describe("executeTool - run_bash", () => {
    it("executes an allowed command and returns stdout", async () => {
      // Given: exec returns stdout
      mockExecReturning("On branch main\n");
      const manager = createOllamaToolManager(makeConfig());

      // When
      const result = await manager.executeTool("run_bash", { command: "git status" });

      // Then
      expect(result).toContain("On branch main");
    });

    it("rejects a denied command without executing it", async () => {
      const manager = createOllamaToolManager(makeConfig());

      const result = await manager.executeTool("run_bash", { command: "rm -rf /" });

      expect(result).toMatch(/not allowed/i);
      expect(mockExecImpl).not.toHaveBeenCalled();
    });
  });

  describe("executeTool - glob_files", () => {
    it("returns matching file paths", async () => {
      // Given
      mockGlobReturning(["src/foo.ts", "src/bar.ts"]);
      const manager = createOllamaToolManager(makeConfig());

      // When
      const result = await manager.executeTool("glob_files", { pattern: "src/**/*.ts" });

      // Then
      expect(result).toContain("src/foo.ts");
      expect(result).toContain("src/bar.ts");
    });

    it("returns 'No files found' when glob matches nothing", async () => {
      mockGlobReturning([]);
      const manager = createOllamaToolManager(makeConfig());

      const result = await manager.executeTool("glob_files", { pattern: "*.xyz" });

      expect(result).toBe("No files found");
    });
  });

  describe("executeTool - web_fetch", () => {
    it("fetches URL and returns text", async () => {
      // Given: mock global fetch
      const mockFetch = vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue("<html>page</html>") });
      vi.stubGlobal("fetch", mockFetch);

      const manager = createOllamaToolManager(makeConfig());

      // When
      const result = await manager.executeTool("web_fetch", { url: "https://example.com" });

      // Then
      expect(result).toBe("<html>page</html>");

      vi.unstubAllGlobals();
    });
  });

  // ---- executeTool: MCP ----
  describe("executeTool - MCP tools", () => {
    it("calls MCP callTool and returns text content", async () => {
      // Given: MCP server connected with notes_search tool
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Note result" }],
      });
      const manager = createOllamaToolManager(makeConfig({ "apple-mcp": STDIO_SERVER }));
      await manager.getTools(); // trigger initialization

      // When
      const result = await manager.executeTool("mcp__apple_mcp__notes_search", { query: "test" });

      // Then
      expect(result).toBe("Note result");
      expect(mockCallTool).toHaveBeenCalledWith({ name: "notes_search", arguments: { query: "test" } });
    });

    it("returns error when MCP client is not connected", async () => {
      // Given: connect fails so no client is registered
      mockConnect.mockRejectedValue(new Error("offline"));
      const manager = createOllamaToolManager(makeConfig({ "apple-mcp": STDIO_SERVER }));
      await manager.getTools(); // trigger (failed) initialization

      // When
      const result = await manager.executeTool("mcp__apple_mcp__notes_search", { query: "test" });

      // Then
      expect(result).toMatch(/not connected/i);
    });
  });

  // ---- dispose ----
  describe("dispose", () => {
    it("closes all connected MCP clients", async () => {
      // Given: manager with a connected MCP server
      const manager = createOllamaToolManager(makeConfig({ "apple-mcp": STDIO_SERVER }));
      await manager.getTools(); // trigger initialization

      // When
      await manager.dispose();

      // Then
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---- unknown tool ----
  describe("executeTool - unknown tool", () => {
    it("returns error for completely unknown tool name", async () => {
      const manager = createOllamaToolManager(makeConfig());
      const result = await manager.executeTool("nonexistent_tool", {});
      expect(result).toMatch(/unknown tool/i);
    });
  });
});
