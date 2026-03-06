# Python / Qwen-Agent 移行設計

**日付**: 2026-03-06
**ステータス**: 承認済み

## 背景・動機

現在のプロジェクトはTypeScript製のDiscord botで、WebSearchなどのツールをすべて自前実装している。Qwen-Agentに移行することで、組み込みツール（web_search、code_interpreter等）をそのまま利用でき、ツール実装コストを大幅に削減できる。

## 目標

- TypeScript → Python への全面移行
- Qwen-Agent をエージェントフレームワークのコアとして採用
- 既存機能をすべて移行（マルチモデル・カレンダーモード・チャンネルモード・スケジュール・トーン・MCP）
- 新機能: LLMによる絵文字リアクション自動付与

## アーキテクチャ

```
discord.py (Discord層)
  ├── on_message
  │   ├── CommandRouter  (!clear / !tone / !calendar / !channel)
  │   ├── MentionHandler → AgentRouter → LLMハンドラー
  │   └── ReactionHandler → 軽量LLM判定 → add_reaction()
  └── ScheduleRunner (APScheduler)

エージェント層
  ├── QwenAgent   → Qwen-Agent (組み込みツール全部使える)
  ├── ClaudeAgent → anthropic-python SDK + ツールwrapper
  ├── GeminiAgent → google-generativeai
  └── CodexAgent  → subprocess

ストア層 (Python dataclass + JSON/SQLite)
  HistoryStore / ToneStore / CalendarStore / ChannelStore / ScheduleStore
```

## ディレクトリ構成

```
src/
  main.py
  config.py
  bot.py
  agents/
    base.py        # AgentHandler 抽象クラス
    qwen.py        # Qwen-Agent ベース（組み込みツール活用）
    claude.py      # Anthropic SDK
    gemini.py      # Google SDK
    codex.py       # subprocess
  commands/
    router.py
    clear.py
    tone.py
    calendar.py
    channel.py
  stores/
    history.py
    tone.py
    calendar.py
    channel.py
    schedule.py
  discord/
    splitter.py          # 2000文字分割
    reaction_handler.py  # LLMリアクション判定
  schedule/
    parser.py
    runner.py
```

## 主要コンポーネント詳細

### AgentHandler 抽象クラス (agents/base.py)

```python
class AgentHandler(ABC):
    @abstractmethod
    async def ask(self, prompt: str, channel_id: str) -> str: ...
    @abstractmethod
    def clear_history(self, channel_id: str) -> None: ...
```

### QwenAgent (agents/qwen.py)

- `qwen_agent.agents.Assistant` を継承
- 組み込みツール: `WebSearch`, `WebBrowser`, `CodeInterpreter`
- MCP接続も Qwen-Agent の MCPサポート経由
- Ollama / DashScope どちらでも動作

### ClaudeAgent (agents/claude.py)

- `anthropic` Python SDK を直接使用
- ツール実行が必要な場合は `qwen_agent.tools` を呼び出す wrapper を実装
- セッション履歴を `HistoryStore` で管理

### ReactionHandler (discord/reaction_handler.py)

- `on_message` で全メッセージを受信
- 軽量LLM呼び出し（Qwen-Agent）でメッセージを判定し絵文字を1つ返す
- 判定結果が「なし」の場合はスキップ（"適宜"）
- メイン応答と非同期並行実行（`asyncio.create_task`）
- チャンネルごとのレートリミット（連続スパム防止）

### ScheduleRunner (schedule/runner.py)

- APScheduler でスケジュール管理
- `schedule/parser.py` で自然言語 → cron 変換（chrono-nodeの代替: dateparser）
- スケジュールは `stores/schedule.py` でJSONに永続化

## Qwen-Agentで解決できる実装コスト

| 現状（自前実装） | Qwen-Agent後 |
|---|---|
| `src/tools/builtin/web.ts` (Tavily wrapper) | `qwen_agent.tools.WebSearch` 組み込み |
| `src/tools/builtin/web.ts` (web_fetch) | `qwen_agent.tools.WebBrowser` 組み込み |
| `src/tools/builtin/file.ts` | `qwen_agent.tools.CodeInterpreter` |
| `src/tools/mcp/client.ts` (自前MCP client) | Qwen-Agent MCP組み込みサポート |
| `src/tools/registry.ts` (ToolRegistry) | Qwen-Agent ツール登録機構 |

## 依存ライブラリ

```
discord.py>=2.3
qwen-agent[gui,rag,code_interpreter,mcp]
anthropic
google-generativeai
apscheduler
dateparser
python-dotenv
```

## テスト方針

- pytest + pytest-asyncio
- discord.py の Mock は `unittest.mock` で対応
- 各AgentHandler は抽象クラスを介してモック可能
- 既存のBDDスタイル（Given/When/Then）を踏襲

## 移行しないもの

- TypeScript の `dist/` 以下（Pythonで再実装）
- `node_modules/`
- `.claude/settings.json` の permissions 設定は `config.py` の定数に移植
