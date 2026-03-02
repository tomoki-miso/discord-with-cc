import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

export const ALLOWED_TOOLS = [
  "Bash(npm run *)",
  "Bash(npx tsc *)",
  "Bash(npx vitest *)",
  "Bash(node *)",
  "Bash(tsx *)",
  "Bash(git status)",
  "Bash(git diff *)",
  "Bash(git log *)",
  "Bash(git add *)",
  "Bash(git commit *)",
  "Bash(git branch *)",
  "Bash(git checkout *)",
  "Bash(git stash *)",
  "Bash(ls *)",
  "Bash(cat *)",
  "Bash(head *)",
  "Bash(tail *)",
  "Bash(wc *)",
  "Bash(find *)",
  "Bash(grep *)",
  "Bash(mkdir *)",
  "Bash(cp *)",
  "Bash(mv *)",
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
] as const;

export const DISALLOWED_TOOLS = [
  "Read(.env)",
  "Read(.env.*)",
  "Edit(.env)",
  "Edit(.env.*)",
  "Write(.env)",
  "Write(.env.*)",
  "Bash(rm -rf *)",
  "Bash(git push *)",
  "Bash(curl *)",
  "Bash(wget *)",
  "Bash(cat .env*)",
  "Bash(head .env*)",
  "Bash(tail .env*)",
  "Bash(grep * .env*)",
] as const;

export const MCP_SERVERS: Record<string, McpServerConfig> = {
  slack: {
    type: "http",
    url: "https://mcp.slack.com/mcp",
  },
  context7: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  },
  "apple-mcp": {
    type: "stdio",
    command: "bunx",
    args: ["--no-cache", "apple-mcp@latest"],
  },
};
