# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord bot that bridges Discord messaging with coding agents (Claude Code via the Claude Agent SDK, OpenAI CodeX CLI, and Gemini CLI). Users mention the bot in a Discord channel, and it forwards the prompt to the configured agent. Claude keeps session history per channel, while CodeX/Gemini run stateless per request.

## Commands

- `npm run dev` — Start development server (uses tsx with .env.dev)
- `npm run build` — Compile TypeScript (`tsc`)
- `npm run start` — Run compiled output (`node dist/index.js`)
- `npm test` — Run all tests (`vitest run`)
- `npx vitest run src/__tests__/bot.test.ts` — Run a single test file

## Environment Variables

Required: `DISCORD_TOKEN`, `AGENT_WORK_DIR`, `AGENT_TYPE` (`claude`/`codex`/`gemini`, defaults to `claude`). Optional overrides: `CODEX_BIN`, `GEMINI_BIN`, legacy `CLAUDE_WORK_DIR` fallback.

## Architecture

ES module project (`"type": "module"`). All imports use `.js` extensions (Node16 module resolution).

**Data flow:** Discord message → `bot.ts` (extract prompt, manage typing indicator) → `claude.ts` (stream SDK query, aggregate result) → bot splits response at 2000-char Discord limit and sends back.

Key modules:
- `src/index.ts` — Entry point. Validates env vars, wires bot + handler + session store, selects the appropriate agent.
- `src/bot.ts` — Discord.js client. Filters bot messages, responds only to @mentions, splits long responses on newline boundaries.
- `src/claude.ts` — Wraps `query()` from Claude Agent SDK. Streams responses, manages session resume per channel.
- `src/codex.ts` — Non-interactive wrapper over `codex exec --full-auto`.
- `src/gemini.ts` — Non-interactive wrapper over the Gemini CLI.
- `src/history.ts` — In-memory Map-based session store keyed by Discord channel ID.
- `src/permissions.ts` — Allowed/disallowed tool lists and MCP server configs. **Must stay in sync with `.claude/settings.json`** (enforced by `claude-settings.test.ts`).

## Permission Model

`permissions.ts` defines explicit allow/deny lists for Claude SDK tool access. Key restrictions: no `.env` access, no `git push`, no `rm -rf`, no `curl`/`wget`. The test suite verifies these lists match `.claude/settings.json` — update both when changing permissions.

## Testing

Tests use Vitest with `globals: true` (no imports needed for `describe`/`it`/`expect`). Tests follow BDD-style Given/When/Then comments. All external dependencies (discord.js, Claude SDK) are mocked via `vi.mock()`.
