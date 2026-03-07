# CLAUDE.md

> TypeScript 実装: https://github.com/tomoki-miso/discord-with-cc-ts

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord bot (Python). エージェントは claude / gemini / qwen (Ollama) / codex から選択。
Discord チャンネルで Bot にメンションすると、指定したエージェントへメッセージを転送し応答を返す。Claude・Qwen はチャンネルごとに会話履歴を保持。

## Commands

- `ENV_FILE=.env.dev python -m src.main` — 開発起動
- `python -m pytest` — 全テスト実行
- `python -m pytest tests/stores/test_history.py` — 単一ファイル実行

## Environment Variables

Required: `DISCORD_TOKEN`, `AGENT_WORK_DIR`, `AGENT_TYPE` (`claude`/`gemini`/`qwen`/`codex`, default: `qwen`)

Agent-specific:
- `claude`: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (default: `claude-sonnet-4-6`)
- `gemini`: `GOOGLE_API_KEY`, `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- `qwen`: `OLLAMA_API_URL` (default: `http://localhost:11434`), `OLLAMA_MODEL` (default: `qwen2.5:14b`), `OLLAMA_NUM_CTX` (default: `8192`)

Optional: `DISCORD_BOT_PROMPT`, `DEFAULT_TONE`, `CHANNELS_FILE` (default: `data/channels.json`), `TAVILY_API_KEY`

## Architecture

Entry: `python -m src.main`

**Data flow:** Discord @mention → `bot.py` → `CommandRouter`（`!command` の場合）or `agent.ask()` → 2000文字分割 → 送信

Key modules:
- `src/main.py` — エントリポイント。全ストア・コマンド・エージェント・スケジューラーを配線
- `src/bot.py` — discord.py クライアント。@mention 検出、typing indicator、リアクション
- `src/config.py` — 環境変数を一括管理
- `src/agents/base.py` — AgentHandler プロトコル（抽象基底）
- `src/agents/claude.py` — Anthropic SDK。チャンネルごとの会話履歴
- `src/agents/gemini.py` — Google Generative AI SDK
- `src/agents/qwen.py` — Ollama API (Qwen)。チャンネルごとの会話履歴
- `src/agents/codex.py` — CodeX CLI（ステートレス）
- `src/commands/router.py` — CommandRouter（prefix マッチング）
- `src/commands/{clear,tone,calendar,channel,whimsy,emoji,reaction}.py` — コマンドハンドラー
- `src/stores/{history,tone,calendar,channel,schedule,whimsy,emoji,reaction}.py` — 機能別ストア
- `src/discord/splitter.py` — split_message()（2000文字分割）
- `src/discord/reaction_handler.py` — リアクションハンドラー
- `src/schedule/{parser,runner}.py` — スケジュール送信

## Testing

pytest 使用。`tests/` が `src/` のミラー構造。
外部依存（discord.py, Anthropic SDK, Google API）は `unittest.mock` でモック。
