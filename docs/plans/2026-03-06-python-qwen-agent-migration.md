# Python/Qwen-Agent Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** TypeScriptのDiscord botをPython + Qwen-Agentに全面移行し、組み込みツール（web_search等）の自前実装コストを削減し、LLMによる絵文字リアクション自動付与機能を追加する。

**Architecture:** discord.pyでDiscord層を担い、Qwen-AgentをQwen/Ollamaエージェントのコアに採用。ClaudeはAnthropicPython SDKを直接使用し、全エージェントはAgentHandler抽象クラスに統一。ReactionHandlerがon_messageで全メッセージを受信し、非同期で軽量LLM判定を行いリアクションを付与する。

**Tech Stack:** Python 3.11+, discord.py 2.3+, qwen-agent[mcp], anthropic, google-generativeai, APScheduler, dateparser, pytest + pytest-asyncio

**Design Doc:** `docs/plans/2026-03-06-python-qwen-agent-migration-design.md`

---

## Phase 1: プロジェクトセットアップ

### Task 1: Python プロジェクト初期化

**Files:**
- Create: `pyproject.toml`
- Create: `src/__init__.py`
- Create: `tests/__init__.py`
- Create: `.python-version`

**Step 1: pyproject.toml を作成**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "discord-with-cc"
version = "2.0.0"
requires-python = ">=3.11"
dependencies = [
    "discord.py>=2.3",
    "qwen-agent[mcp]>=0.0.10",
    "anthropic>=0.40",
    "google-generativeai>=0.8",
    "apscheduler>=3.10",
    "dateparser>=1.2",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
    "pytest-mock>=3.14",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.setuptools.packages.find]
where = ["src"]
```

**Step 2: ディレクトリを作成**

```bash
mkdir -p src/agents src/commands src/stores src/discord src/schedule
touch src/__init__.py src/agents/__init__.py src/commands/__init__.py
touch src/stores/__init__.py src/discord/__init__.py src/schedule/__init__.py
mkdir -p tests/agents tests/commands tests/stores tests/discord tests/schedule
touch tests/__init__.py tests/agents/__init__.py tests/commands/__init__.py
touch tests/stores/__init__.py tests/discord/__init__.py tests/schedule/__init__.py
```

**Step 3: 依存ライブラリをインストール**

```bash
pip install -e ".[dev]"
```

Expected: エラーなくインストール完了

**Step 4: .python-version を作成**

```
3.11
```

**Step 5: Commit**

```bash
git add pyproject.toml src/ tests/ .python-version
git commit -m "chore: Python プロジェクト初期化"
```

---

### Task 2: 環境変数設定ファイル

**Files:**
- Create: `src/config.py`
- Create: `tests/test_config.py`
- Create: `.env.dev.example`

**Step 1: テストを書く**

```python
# tests/test_config.py
import os
import pytest

def test_discord_token_required(monkeypatch):
    monkeypatch.delenv("DISCORD_TOKEN", raising=False)
    with pytest.raises(ValueError, match="DISCORD_TOKEN"):
        import importlib
        import src.config as cfg
        importlib.reload(cfg)

def test_agent_type_defaults_to_qwen(monkeypatch):
    monkeypatch.setenv("DISCORD_TOKEN", "test-token")
    monkeypatch.setenv("AGENT_WORK_DIR", "/tmp")
    monkeypatch.delenv("AGENT_TYPE", raising=False)
    import importlib
    import src.config as cfg
    importlib.reload(cfg)
    assert cfg.AGENT_TYPE == "qwen"

def test_all_env_vars_loaded(monkeypatch):
    monkeypatch.setenv("DISCORD_TOKEN", "tok")
    monkeypatch.setenv("AGENT_WORK_DIR", "/work")
    monkeypatch.setenv("AGENT_TYPE", "claude")
    monkeypatch.setenv("OLLAMA_API_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5")
    import importlib
    import src.config as cfg
    importlib.reload(cfg)
    assert cfg.DISCORD_TOKEN == "tok"
    assert cfg.OLLAMA_API_URL == "http://localhost:11434"
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/test_config.py -v
```

Expected: FAIL (src.config が存在しない)

**Step 3: config.py を実装**

```python
# src/config.py
import os
from dotenv import load_dotenv

load_dotenv()

def _require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise ValueError(f"環境変数 {key} が設定されていません")
    return val

DISCORD_TOKEN: str = _require("DISCORD_TOKEN")
AGENT_WORK_DIR: str = _require("AGENT_WORK_DIR")
AGENT_TYPE: str = os.getenv("AGENT_TYPE", "qwen")

OLLAMA_API_URL: str = os.getenv("OLLAMA_API_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:14b")
OLLAMA_NUM_CTX: int = int(os.getenv("OLLAMA_NUM_CTX", "8192"))

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

DISCORD_BOT_PROMPT: str = os.getenv(
    "DISCORD_BOT_PROMPT",
    "あなたはDiscordのアシスタントです。簡潔に日本語で回答してください。"
)
```

**Step 4: テストが通ることを確認**

```bash
pytest tests/test_config.py -v
```

Expected: PASS

**Step 5: .env.dev.example を作成**

```bash
# .env.dev.example
DISCORD_TOKEN=your-discord-token
AGENT_WORK_DIR=/path/to/workdir
AGENT_TYPE=qwen

OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b

ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
TAVILY_API_KEY=tvly-...

DISCORD_BOT_PROMPT=あなたはDiscordのアシスタントです。
```

**Step 6: Commit**

```bash
git add src/config.py tests/test_config.py .env.dev.example
git commit -m "feat: 環境変数設定モジュール(config.py)"
```

---

## Phase 2: ストア層

### Task 3: HistoryStore

**Files:**
- Create: `src/stores/history.py`
- Create: `tests/stores/test_history.py`

**Step 1: テストを書く**

```python
# tests/stores/test_history.py
from src.stores.history import HistoryStore

def test_empty_history_on_new_channel():
    store = HistoryStore()
    assert store.get("ch1") == []

def test_append_and_get():
    store = HistoryStore()
    store.append("ch1", {"role": "user", "content": "hello"})
    assert store.get("ch1") == [{"role": "user", "content": "hello"}]

def test_clear_resets_history():
    store = HistoryStore()
    store.append("ch1", {"role": "user", "content": "hello"})
    store.clear("ch1")
    assert store.get("ch1") == []

def test_clear_increments_generation():
    store = HistoryStore()
    gen1 = store.generation("ch1")
    store.clear("ch1")
    assert store.generation("ch1") == gen1 + 1

def test_channels_are_isolated():
    store = HistoryStore()
    store.append("ch1", {"role": "user", "content": "a"})
    assert store.get("ch2") == []
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/stores/test_history.py -v
```

**Step 3: HistoryStore を実装**

```python
# src/stores/history.py
from typing import Any

class HistoryStore:
    def __init__(self) -> None:
        self._history: dict[str, list[dict[str, Any]]] = {}
        self._generation: dict[str, int] = {}

    def get(self, channel_id: str) -> list[dict[str, Any]]:
        return list(self._history.get(channel_id, []))

    def append(self, channel_id: str, message: dict[str, Any]) -> None:
        if channel_id not in self._history:
            self._history[channel_id] = []
        self._history[channel_id].append(message)

    def set(self, channel_id: str, messages: list[dict[str, Any]]) -> None:
        self._history[channel_id] = list(messages)

    def clear(self, channel_id: str) -> None:
        self._history.pop(channel_id, None)
        self._generation[channel_id] = self._generation.get(channel_id, 0) + 1

    def generation(self, channel_id: str) -> int:
        return self._generation.get(channel_id, 0)
```

**Step 4: テストが通ることを確認**

```bash
pytest tests/stores/test_history.py -v
```

**Step 5: Commit**

```bash
git add src/stores/history.py tests/stores/test_history.py
git commit -m "feat: HistoryStore 実装"
```

---

### Task 4: ToneStore

**Files:**
- Create: `src/stores/tone.py`
- Create: `tests/stores/test_tone.py`

**Step 1: テストを書く**

```python
# tests/stores/test_tone.py
from src.stores.tone import ToneStore

def test_default_tone_is_empty():
    store = ToneStore()
    assert store.get_system_prompt() == ""

def test_set_and_get_tone():
    store = ToneStore()
    store.set("ch1", "丁寧語で話してください")
    assert store.get("ch1") == "丁寧語で話してください"

def test_get_system_prompt_includes_tone():
    store = ToneStore()
    store.set("global", "カジュアルに話してください")
    prompt = store.get_system_prompt()
    assert "カジュアルに話してください" in prompt

def test_clear_tone():
    store = ToneStore()
    store.set("ch1", "丁寧語")
    store.clear("ch1")
    assert store.get("ch1") == ""
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/stores/test_tone.py -v
```

**Step 3: ToneStore を実装**

```python
# src/stores/tone.py

class ToneStore:
    def __init__(self) -> None:
        self._tones: dict[str, str] = {}

    def set(self, key: str, tone: str) -> None:
        self._tones[key] = tone

    def get(self, key: str) -> str:
        return self._tones.get(key, "")

    def clear(self, key: str) -> None:
        self._tones.pop(key, None)

    def get_system_prompt(self) -> str:
        """全トーンを結合してシステムプロンプト用文字列を返す"""
        parts = [v for v in self._tones.values() if v]
        return "\n".join(parts)
```

**Step 4: テストが通ることを確認**

```bash
pytest tests/stores/test_tone.py -v
```

**Step 5: Commit**

```bash
git add src/stores/tone.py tests/stores/test_tone.py
git commit -m "feat: ToneStore 実装"
```

---

### Task 5: CalendarStore + CalendarMode

**Files:**
- Create: `src/stores/calendar.py`
- Create: `tests/stores/test_calendar.py`

**Step 1: テストを書く**

```python
# tests/stores/test_calendar.py
from src.stores.calendar import CalendarStore, CalendarMode

def test_calendar_mode_off_by_default():
    store = CalendarStore()
    assert store.is_enabled("ch1") is False

def test_enable_calendar_mode():
    store = CalendarStore()
    store.enable("ch1")
    assert store.is_enabled("ch1") is True

def test_disable_calendar_mode():
    store = CalendarStore()
    store.enable("ch1")
    store.disable("ch1")
    assert store.is_enabled("ch1") is False

def test_calendar_mode_enum():
    assert CalendarMode.ON == "on"
    assert CalendarMode.OFF == "off"
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/stores/test_calendar.py -v
```

**Step 3: 実装**

```python
# src/stores/calendar.py
from enum import StrEnum

class CalendarMode(StrEnum):
    ON = "on"
    OFF = "off"

class CalendarStore:
    def __init__(self) -> None:
        self._modes: dict[str, CalendarMode] = {}

    def enable(self, channel_id: str) -> None:
        self._modes[channel_id] = CalendarMode.ON

    def disable(self, channel_id: str) -> None:
        self._modes[channel_id] = CalendarMode.OFF

    def is_enabled(self, channel_id: str) -> bool:
        return self._modes.get(channel_id) == CalendarMode.ON
```

**Step 4: テスト確認**

```bash
pytest tests/stores/test_calendar.py -v
```

**Step 5: Commit**

```bash
git add src/stores/calendar.py tests/stores/test_calendar.py
git commit -m "feat: CalendarStore + CalendarMode 実装"
```

---

### Task 6: ChannelStore

**Files:**
- Create: `src/stores/channel.py`
- Create: `tests/stores/test_channel.py`

**Step 1: テストを書く**

```python
# tests/stores/test_channel.py
from src.stores.channel import ChannelStore

def test_no_restriction_by_default():
    store = ChannelStore()
    assert store.get_allowed_channels() == set()
    assert store.is_allowed("ch1") is True  # 制限なし=全許可

def test_add_channel_restriction():
    store = ChannelStore()
    store.add("ch1")
    assert store.is_allowed("ch1") is True
    assert store.is_allowed("ch2") is False  # ch1のみ許可

def test_remove_channel():
    store = ChannelStore()
    store.add("ch1")
    store.remove("ch1")
    assert store.is_allowed("ch2") is True  # 制限解除=全許可

def test_get_allowed_channels():
    store = ChannelStore()
    store.add("ch1")
    store.add("ch2")
    assert store.get_allowed_channels() == {"ch1", "ch2"}
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/stores/test_channel.py -v
```

**Step 3: 実装**

```python
# src/stores/channel.py

class ChannelStore:
    def __init__(self) -> None:
        self._channels: set[str] = set()

    def add(self, channel_id: str) -> None:
        self._channels.add(channel_id)

    def remove(self, channel_id: str) -> None:
        self._channels.discard(channel_id)

    def get_allowed_channels(self) -> set[str]:
        return set(self._channels)

    def is_allowed(self, channel_id: str) -> bool:
        if not self._channels:
            return True  # 制限なし = 全チャンネル許可
        return channel_id in self._channels
```

**Step 4: テスト確認**

```bash
pytest tests/stores/test_channel.py -v
```

**Step 5: Commit**

```bash
git add src/stores/channel.py tests/stores/test_channel.py
git commit -m "feat: ChannelStore 実装"
```

---

### Task 7: ScheduleStore

**Files:**
- Create: `src/stores/schedule.py`
- Create: `tests/stores/test_schedule.py`

**Step 1: テストを書く**

```python
# tests/stores/test_schedule.py
import json
import tempfile
from pathlib import Path
from src.stores.schedule import ScheduleStore, ScheduleEntry

def test_add_and_list_schedule():
    store = ScheduleStore()
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    store.add(entry)
    assert len(store.list()) == 1
    assert store.list()[0].message == "おはよう"

def test_remove_schedule():
    store = ScheduleStore()
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    store.add(entry)
    store.remove("1")
    assert store.list() == []

def test_persist_and_load(tmp_path):
    path = tmp_path / "schedules.json"
    store = ScheduleStore(path=path)
    store.add(ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="test"))
    store2 = ScheduleStore(path=path)
    assert len(store2.list()) == 1
    assert store2.list()[0].id == "1"
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/stores/test_schedule.py -v
```

**Step 3: 実装**

```python
# src/stores/schedule.py
import json
from dataclasses import dataclass, asdict
from pathlib import Path

@dataclass
class ScheduleEntry:
    id: str
    channel_id: str
    cron: str
    message: str

class ScheduleStore:
    def __init__(self, path: Path | None = None) -> None:
        self._path = path or Path("data/schedules.json")
        self._entries: dict[str, ScheduleEntry] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            data = json.loads(self._path.read_text())
            self._entries = {d["id"]: ScheduleEntry(**d) for d in data}

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps([asdict(e) for e in self._entries.values()]))

    def add(self, entry: ScheduleEntry) -> None:
        self._entries[entry.id] = entry
        self._save()

    def remove(self, entry_id: str) -> None:
        self._entries.pop(entry_id, None)
        self._save()

    def list(self) -> list[ScheduleEntry]:
        return list(self._entries.values())
```

**Step 4: テスト確認**

```bash
pytest tests/stores/test_schedule.py -v
```

**Step 5: Commit**

```bash
git add src/stores/schedule.py tests/stores/test_schedule.py
git commit -m "feat: ScheduleStore 実装"
```

---

## Phase 3: エージェント層

### Task 8: AgentHandler 抽象クラス

**Files:**
- Create: `src/agents/base.py`
- Create: `tests/agents/test_base.py`

**Step 1: テストを書く**

```python
# tests/agents/test_base.py
import pytest
from src.agents.base import AgentHandler

def test_agent_handler_is_abstract():
    with pytest.raises(TypeError):
        AgentHandler()  # type: ignore

class ConcreteAgent(AgentHandler):
    async def ask(self, prompt: str, channel_id: str) -> str:
        return "response"
    def clear_history(self, channel_id: str) -> None:
        pass

async def test_concrete_agent_works():
    agent = ConcreteAgent()
    result = await agent.ask("hello", "ch1")
    assert result == "response"
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/agents/test_base.py -v
```

**Step 3: 実装**

```python
# src/agents/base.py
from abc import ABC, abstractmethod

class AgentHandler(ABC):
    @abstractmethod
    async def ask(self, prompt: str, channel_id: str) -> str:
        """プロンプトを受け取り、応答文字列を返す"""
        ...

    @abstractmethod
    def clear_history(self, channel_id: str) -> None:
        """指定チャンネルの履歴をクリアする"""
        ...
```

**Step 4: テスト確認**

```bash
pytest tests/agents/test_base.py -v
```

**Step 5: Commit**

```bash
git add src/agents/base.py tests/agents/test_base.py
git commit -m "feat: AgentHandler 抽象クラス"
```

---

### Task 9: QwenAgent (Qwen-Agent ベース)

**Files:**
- Create: `src/agents/qwen.py`
- Create: `tests/agents/test_qwen.py`

**Step 1: テストを書く**

```python
# tests/agents/test_qwen.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.agents.qwen import QwenAgent

@pytest.fixture
def agent():
    return QwenAgent(
        api_url="http://localhost:11434",
        model="qwen2.5:14b",
        system_prompt="テスト用プロンプト",
    )

async def test_ask_returns_string(agent):
    mock_response = [{"role": "assistant", "content": [{"text": "こんにちは"}]}]
    with patch.object(agent._assistant, "run", return_value=iter([mock_response])):
        result = await agent.ask("hello", "ch1")
    assert isinstance(result, str)
    assert "こんにちは" in result

async def test_clear_history(agent):
    agent._history["ch1"] = [{"role": "user", "content": "test"}]
    agent.clear_history("ch1")
    assert agent._history.get("ch1") is None
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/agents/test_qwen.py -v
```

**Step 3: QwenAgent を実装**

```python
# src/agents/qwen.py
import asyncio
from typing import Any
from qwen_agent.agents import Assistant
from qwen_agent.llm.schema import Message
from src.agents.base import AgentHandler

class QwenAgent(AgentHandler):
    def __init__(
        self,
        api_url: str,
        model: str,
        system_prompt: str,
        tools: list[str] | None = None,
    ) -> None:
        self._system_prompt = system_prompt
        self._history: dict[str, list[dict[str, Any]]] = {}
        llm_config = {
            "model": model,
            "model_server": api_url + "/v1",
            "api_key": "ollama",
        }
        self._assistant = Assistant(
            llm=llm_config,
            system_message=system_prompt,
            function_list=tools or ["web_search", "web_browser"],
        )

    async def ask(self, prompt: str, channel_id: str) -> str:
        history = self._history.get(channel_id, [])
        messages = history + [{"role": "user", "content": prompt}]

        loop = asyncio.get_event_loop()
        response_text = await loop.run_in_executor(
            None, self._run_sync, messages
        )

        self._history[channel_id] = messages + [
            {"role": "assistant", "content": response_text}
        ]
        return response_text

    def _run_sync(self, messages: list[dict[str, Any]]) -> str:
        result = ""
        for responses in self._assistant.run(messages):
            if responses:
                last = responses[-1]
                if isinstance(last.get("content"), list):
                    for item in last["content"]:
                        if isinstance(item, dict) and item.get("text"):
                            result = item["text"]
                elif isinstance(last.get("content"), str):
                    result = last["content"]
        return result or "（応答なし）"

    def clear_history(self, channel_id: str) -> None:
        self._history.pop(channel_id, None)
```

**Step 4: テスト確認**

```bash
pytest tests/agents/test_qwen.py -v
```

**Step 5: Commit**

```bash
git add src/agents/qwen.py tests/agents/test_qwen.py
git commit -m "feat: QwenAgent (Qwen-Agentベース) 実装"
```

---

### Task 10: ClaudeAgent

**Files:**
- Create: `src/agents/claude.py`
- Create: `tests/agents/test_claude.py`

**Step 1: テストを書く**

```python
# tests/agents/test_claude.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.agents.claude import ClaudeAgent

@pytest.fixture
def agent():
    return ClaudeAgent(
        api_key="test-key",
        model="claude-sonnet-4-6",
        system_prompt="テスト",
    )

async def test_ask_returns_response(agent):
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="テスト応答")]

    with patch.object(agent._client.messages, "create", return_value=mock_message):
        result = await agent.ask("hello", "ch1")
    assert result == "テスト応答"

async def test_history_accumulates(agent):
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="応答1")]

    with patch.object(agent._client.messages, "create", return_value=mock_message):
        await agent.ask("質問1", "ch1")

    assert len(agent._store.get("ch1")) == 2  # user + assistant

async def test_clear_history(agent):
    agent._store.set("ch1", [{"role": "user", "content": "test"}])
    agent.clear_history("ch1")
    assert agent._store.get("ch1") == []
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/agents/test_claude.py -v
```

**Step 3: ClaudeAgent を実装**

```python
# src/agents/claude.py
import asyncio
import anthropic
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore

class ClaudeAgent(AgentHandler):
    def __init__(
        self,
        api_key: str,
        model: str,
        system_prompt: str,
    ) -> None:
        self._model = model
        self._system_prompt = system_prompt
        self._client = anthropic.Anthropic(api_key=api_key)
        self._store = HistoryStore()

    async def ask(self, prompt: str, channel_id: str) -> str:
        history = self._store.get(channel_id)
        messages = history + [{"role": "user", "content": prompt}]

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                system=self._system_prompt,
                messages=messages,
            ),
        )

        text = response.content[0].text
        self._store.set(
            channel_id,
            messages + [{"role": "assistant", "content": text}],
        )
        return text

    def clear_history(self, channel_id: str) -> None:
        self._store.clear(channel_id)
```

**Step 4: テスト確認**

```bash
pytest tests/agents/test_claude.py -v
```

**Step 5: Commit**

```bash
git add src/agents/claude.py tests/agents/test_claude.py
git commit -m "feat: ClaudeAgent 実装"
```

---

### Task 11: GeminiAgent + CodexAgent

**Files:**
- Create: `src/agents/gemini.py`
- Create: `src/agents/codex.py`
- Create: `tests/agents/test_gemini.py`
- Create: `tests/agents/test_codex.py`

**Step 1: GeminiAgent のテストを書く**

```python
# tests/agents/test_gemini.py
import pytest
from unittest.mock import MagicMock, patch
from src.agents.gemini import GeminiAgent

@pytest.fixture
def agent():
    return GeminiAgent(api_key="test-key", model="gemini-2.0-flash", system_prompt="テスト")

async def test_ask_returns_response(agent):
    mock_response = MagicMock()
    mock_response.text = "Gemini応答"
    with patch.object(agent._model_client, "generate_content", return_value=mock_response):
        result = await agent.ask("hello", "ch1")
    assert result == "Gemini応答"
```

**Step 2: CodexAgent のテストを書く**

```python
# tests/agents/test_codex.py
import pytest
from unittest.mock import patch, MagicMock
from src.agents.codex import CodexAgent

@pytest.fixture
def agent():
    return CodexAgent(work_dir="/tmp", codex_bin="codex")

async def test_ask_calls_subprocess(agent):
    mock_proc = MagicMock()
    mock_proc.stdout = "Codex応答\n"
    mock_proc.returncode = 0
    with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        result = await agent.ask("hello", "ch1")
    assert "Codex応答" in result

def test_clear_history_is_noop(agent):
    agent.clear_history("ch1")  # stateless なのでエラーが出ないことを確認
```

**Step 3: テストが失敗することを確認**

```bash
pytest tests/agents/test_gemini.py tests/agents/test_codex.py -v
```

**Step 4: GeminiAgent を実装**

```python
# src/agents/gemini.py
import asyncio
import google.generativeai as genai
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore

class GeminiAgent(AgentHandler):
    def __init__(self, api_key: str, model: str, system_prompt: str) -> None:
        genai.configure(api_key=api_key)
        self._model_client = genai.GenerativeModel(
            model_name=model,
            system_instruction=system_prompt,
        )
        self._store = HistoryStore()

    async def ask(self, prompt: str, channel_id: str) -> str:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: self._model_client.generate_content(prompt)
        )
        return response.text

    def clear_history(self, channel_id: str) -> None:
        self._store.clear(channel_id)
```

**Step 5: CodexAgent を実装**

```python
# src/agents/codex.py
import asyncio
from src.agents.base import AgentHandler

class CodexAgent(AgentHandler):
    def __init__(self, work_dir: str, codex_bin: str = "codex") -> None:
        self._work_dir = work_dir
        self._codex_bin = codex_bin

    async def ask(self, prompt: str, channel_id: str) -> str:
        proc = await asyncio.create_subprocess_exec(
            self._codex_bin, "exec", "--full-auto", prompt,
            cwd=self._work_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            return f"エラー: {stderr.decode()}"
        return stdout.decode().strip()

    def clear_history(self, channel_id: str) -> None:
        pass  # stateless
```

**Step 6: テスト確認**

```bash
pytest tests/agents/ -v
```

**Step 7: Commit**

```bash
git add src/agents/gemini.py src/agents/codex.py tests/agents/test_gemini.py tests/agents/test_codex.py
git commit -m "feat: GeminiAgent + CodexAgent 実装"
```

---

## Phase 4: Discord層

### Task 12: MessageSplitter

**Files:**
- Create: `src/discord/splitter.py`
- Create: `tests/discord/test_splitter.py`

**Step 1: テストを書く**

```python
# tests/discord/test_splitter.py
from src.discord.splitter import split_message

def test_short_message_not_split():
    parts = split_message("hello", limit=2000)
    assert parts == ["hello"]

def test_long_message_split_at_newline():
    text = "line1\nline2\nline3"
    parts = split_message(text, limit=10)
    assert len(parts) > 1
    assert all(len(p) <= 10 for p in parts)

def test_split_preserves_content():
    text = "a\nb\nc\nd\ne"
    parts = split_message(text, limit=5)
    assert "".join(parts).replace("\n", "") == "abcde"

def test_very_long_word_is_hard_split():
    text = "a" * 2500
    parts = split_message(text, limit=2000)
    assert all(len(p) <= 2000 for p in parts)
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/discord/test_splitter.py -v
```

**Step 3: 実装**

```python
# src/discord/splitter.py

def split_message(text: str, limit: int = 2000) -> list[str]:
    if len(text) <= limit:
        return [text]

    parts: list[str] = []
    while text:
        if len(text) <= limit:
            parts.append(text)
            break
        # 改行でスプリットを試みる
        idx = text.rfind("\n", 0, limit)
        if idx == -1:
            idx = limit  # 強制分割
        parts.append(text[:idx])
        text = text[idx:].lstrip("\n")
    return [p for p in parts if p]
```

**Step 4: テスト確認**

```bash
pytest tests/discord/test_splitter.py -v
```

**Step 5: Commit**

```bash
git add src/discord/splitter.py tests/discord/test_splitter.py
git commit -m "feat: MessageSplitter 実装"
```

---

### Task 13: ReactionHandler（新機能）

**Files:**
- Create: `src/discord/reaction_handler.py`
- Create: `tests/discord/test_reaction_handler.py`

**Step 1: テストを書く**

```python
# tests/discord/test_reaction_handler.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.discord.reaction_handler import ReactionHandler

@pytest.fixture
def handler():
    mock_agent = MagicMock()
    mock_agent.ask = AsyncMock(return_value="👍")
    return ReactionHandler(agent=mock_agent, rate_limit_seconds=0)

async def test_adds_reaction_when_emoji_returned(handler):
    mock_message = AsyncMock()
    mock_message.content = "今日もいい天気ですね"
    mock_message.author.bot = False

    await handler.handle(mock_message)

    mock_message.add_reaction.assert_called_once_with("👍")

async def test_skips_bot_messages(handler):
    mock_message = AsyncMock()
    mock_message.author.bot = True

    await handler.handle(mock_message)

    mock_message.add_reaction.assert_not_called()

async def test_skips_when_no_reaction(handler):
    handler._agent.ask = AsyncMock(return_value="なし")
    mock_message = AsyncMock()
    mock_message.content = "..."
    mock_message.author.bot = False

    await handler.handle(mock_message)

    mock_message.add_reaction.assert_not_called()

async def test_rate_limit_prevents_spam():
    mock_agent = MagicMock()
    mock_agent.ask = AsyncMock(return_value="👍")
    handler = ReactionHandler(agent=mock_agent, rate_limit_seconds=60)

    mock_message = AsyncMock()
    mock_message.content = "test"
    mock_message.author.bot = False
    mock_message.channel.id = "ch1"

    await handler.handle(mock_message)
    await handler.handle(mock_message)

    assert mock_message.add_reaction.call_count == 1
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/discord/test_reaction_handler.py -v
```

**Step 3: ReactionHandler を実装**

```python
# src/discord/reaction_handler.py
import time
import re
from src.agents.base import AgentHandler

REACTION_PROMPT = """以下のメッセージに対して、最も適切な絵文字を1つだけ返してください。
リアクション不要と判断した場合は「なし」と返してください。
絵文字か「なし」のみを返し、説明は不要です。

メッセージ: {message}"""

EMOJI_PATTERN = re.compile(
    r'[\U0001F300-\U0001F9FF\U00002702-\U000027B0\U0001FA00-\U0001FA9F'
    r'\U00002500-\U00002BEF\U0001F004\U0001F0CF]'
)

class ReactionHandler:
    def __init__(self, agent: AgentHandler, rate_limit_seconds: float = 3.0) -> None:
        self._agent = agent
        self._rate_limit = rate_limit_seconds
        self._last_reaction: dict[str, float] = {}

    async def handle(self, message: object) -> None:
        if getattr(getattr(message, "author", None), "bot", False):
            return

        channel_id = str(getattr(getattr(message, "channel", None), "id", ""))
        now = time.monotonic()
        if now - self._last_reaction.get(channel_id, 0) < self._rate_limit:
            return

        content = getattr(message, "content", "")
        if not content:
            return

        try:
            result = await self._agent.ask(
                REACTION_PROMPT.format(message=content[:200]),
                f"reaction_{channel_id}",
            )
            result = result.strip()
            if result == "なし" or not result:
                return

            emojis = EMOJI_PATTERN.findall(result)
            emoji = emojis[0] if emojis else result.split()[0] if result else None
            if emoji:
                await message.add_reaction(emoji)
                self._last_reaction[channel_id] = now
        except Exception:
            pass  # リアクション失敗は無視
```

**Step 4: テスト確認**

```bash
pytest tests/discord/test_reaction_handler.py -v
```

**Step 5: Commit**

```bash
git add src/discord/reaction_handler.py tests/discord/test_reaction_handler.py
git commit -m "feat: ReactionHandler (LLMによる絵文字自動付与)"
```

---

## Phase 5: コマンド層

### Task 14: CommandRouter

**Files:**
- Create: `src/commands/router.py`
- Create: `tests/commands/test_router.py`

**Step 1: テストを書く**

```python
# tests/commands/test_router.py
import pytest
from unittest.mock import AsyncMock
from src.commands.router import CommandRouter

async def test_dispatch_known_command():
    router = CommandRouter()
    handler = AsyncMock(return_value="OK")
    router.register("!clear", handler)

    result = await router.dispatch("!clear", "ch1", "user1")
    assert result == "OK"
    handler.assert_called_once_with("ch1", "user1", "")

async def test_dispatch_with_args():
    router = CommandRouter()
    handler = AsyncMock(return_value="設定済み")
    router.register("!tone", handler)

    result = await router.dispatch("!tone 丁寧語", "ch1", "user1")
    assert result == "設定済み"
    handler.assert_called_once_with("ch1", "user1", "丁寧語")

async def test_dispatch_unknown_returns_none():
    router = CommandRouter()
    result = await router.dispatch("!unknown", "ch1", "user1")
    assert result is None

def test_is_command():
    router = CommandRouter()
    router.register("!clear", AsyncMock())
    assert router.is_command("!clear") is True
    assert router.is_command("hello") is False
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/commands/test_router.py -v
```

**Step 3: 実装**

```python
# src/commands/router.py
from typing import Callable, Awaitable

CommandHandlerFn = Callable[[str, str, str], Awaitable[str | None]]

class CommandRouter:
    def __init__(self) -> None:
        self._handlers: dict[str, CommandHandlerFn] = {}

    def register(self, prefix: str, handler: CommandHandlerFn) -> None:
        self._handlers[prefix] = handler

    def is_command(self, text: str) -> bool:
        return any(text.startswith(p) for p in self._handlers)

    async def dispatch(
        self, text: str, channel_id: str, user_id: str
    ) -> str | None:
        for prefix, handler in self._handlers.items():
            if text.startswith(prefix):
                args = text[len(prefix):].strip()
                return await handler(channel_id, user_id, args)
        return None
```

**Step 4: テスト確認**

```bash
pytest tests/commands/test_router.py -v
```

**Step 5: 各コマンドハンドラーを実装**

```python
# src/commands/clear.py
from src.stores.history import HistoryStore

async def handle_clear(history_store: HistoryStore, channel_id: str, user_id: str, args: str) -> str:
    history_store.clear(channel_id)
    return "履歴をクリアしました"

# src/commands/tone.py
from src.stores.tone import ToneStore

async def handle_tone(tone_store: ToneStore, channel_id: str, user_id: str, args: str) -> str:
    if not args:
        current = tone_store.get(channel_id) or "（未設定）"
        return f"現在のトーン: {current}"
    tone_store.set(channel_id, args)
    return f"トーンを設定しました: {args}"

# src/commands/calendar.py
from src.stores.calendar import CalendarStore

async def handle_calendar(calendar_store: CalendarStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "on":
        calendar_store.enable(channel_id)
        return "カレンダーモードをONにしました"
    elif args == "off":
        calendar_store.disable(channel_id)
        return "カレンダーモードをOFFにしました"
    status = "ON" if calendar_store.is_enabled(channel_id) else "OFF"
    return f"カレンダーモード: {status}"

# src/commands/channel.py
from src.stores.channel import ChannelStore

async def handle_channel(channel_store: ChannelStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "add":
        channel_store.add(channel_id)
        return f"チャンネル {channel_id} を許可リストに追加しました"
    elif args == "remove":
        channel_store.remove(channel_id)
        return f"チャンネル {channel_id} を許可リストから削除しました"
    channels = channel_store.get_allowed_channels()
    return f"許可チャンネル: {', '.join(channels) or '（制限なし）'}"
```

**Step 6: テスト確認**

```bash
pytest tests/commands/ -v
```

**Step 7: Commit**

```bash
git add src/commands/ tests/commands/
git commit -m "feat: CommandRouter + 各コマンドハンドラー実装"
```

---

## Phase 6: スケジュール層

### Task 15: ScheduleParser

**Files:**
- Create: `src/schedule/parser.py`
- Create: `tests/schedule/test_parser.py`

**Step 1: テストを書く**

```python
# tests/schedule/test_parser.py
from src.schedule.parser import parse_schedule_expression

def test_every_day_9am():
    result = parse_schedule_expression("毎日9時に")
    assert result is not None
    assert result["hour"] == 9
    assert result["minute"] == 0

def test_every_monday():
    result = parse_schedule_expression("毎週月曜日の10時に")
    assert result is not None
    assert result["day_of_week"] == "mon"

def test_invalid_expression():
    result = parse_schedule_expression("意味不明な文字列")
    assert result is None
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/schedule/test_parser.py -v
```

**Step 3: 実装**

```python
# src/schedule/parser.py
import re
import dateparser

WEEKDAY_MAP = {"月": "mon", "火": "tue", "水": "wed", "木": "thu", "金": "fri", "土": "sat", "日": "sun"}

def parse_schedule_expression(expr: str) -> dict | None:
    """
    自然言語のスケジュール表現をAPSchedulerのcronパラメータ辞書に変換する
    Returns None if parsing fails
    """
    result: dict = {}

    # 曜日の抽出
    for jp, en in WEEKDAY_MAP.items():
        if jp + "曜" in expr:
            result["day_of_week"] = en
            break

    # 時刻の抽出
    time_match = re.search(r"(\d{1,2})時(?:(\d{2})分)?", expr)
    if time_match:
        result["hour"] = int(time_match.group(1))
        result["minute"] = int(time_match.group(2) or 0)
    else:
        return None

    # 分のみの抽出
    minute_match = re.search(r"(\d+)分おき", expr)
    if minute_match:
        result["minute"] = f"*/{minute_match.group(1)}"
        result["hour"] = "*"

    return result if result else None
```

**Step 4: テスト確認**

```bash
pytest tests/schedule/test_parser.py -v
```

**Step 5: Commit**

```bash
git add src/schedule/parser.py tests/schedule/test_parser.py
git commit -m "feat: ScheduleParser 実装"
```

---

### Task 16: ScheduleRunner

**Files:**
- Create: `src/schedule/runner.py`
- Create: `tests/schedule/test_runner.py`

**Step 1: テストを書く**

```python
# tests/schedule/test_runner.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from src.schedule.runner import ScheduleRunner
from src.stores.schedule import ScheduleEntry

@pytest.fixture
def runner():
    mock_send = AsyncMock()
    store = MagicMock()
    store.list.return_value = []
    return ScheduleRunner(send_message=mock_send, store=store)

def test_add_job(runner):
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    runner.add_job(entry)
    # APSchedulerにジョブが登録されていることを確認
    jobs = runner._scheduler.get_jobs()
    assert len(jobs) == 1

def test_remove_job(runner):
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    runner.add_job(entry)
    runner.remove_job("1")
    jobs = runner._scheduler.get_jobs()
    assert len(jobs) == 0
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/schedule/test_runner.py -v
```

**Step 3: 実装**

```python
# src/schedule/runner.py
import asyncio
from typing import Callable, Awaitable
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from src.stores.schedule import ScheduleStore, ScheduleEntry

SendMessageFn = Callable[[str, str], Awaitable[None]]

class ScheduleRunner:
    def __init__(self, send_message: SendMessageFn, store: ScheduleStore) -> None:
        self._send = send_message
        self._store = store
        self._scheduler = AsyncIOScheduler()

    def start(self) -> None:
        for entry in self._store.list():
            self._add_job_internal(entry)
        self._scheduler.start()

    def add_job(self, entry: ScheduleEntry) -> None:
        self._store.add(entry)
        self._add_job_internal(entry)

    def _add_job_internal(self, entry: ScheduleEntry) -> None:
        self._scheduler.add_job(
            self._send,
            CronTrigger.from_crontab(entry.cron),
            args=[entry.channel_id, entry.message],
            id=entry.id,
            replace_existing=True,
        )

    def remove_job(self, entry_id: str) -> None:
        self._store.remove(entry_id)
        try:
            self._scheduler.remove_job(entry_id)
        except Exception:
            pass
```

**Step 4: テスト確認**

```bash
pytest tests/schedule/test_runner.py -v
```

**Step 5: Commit**

```bash
git add src/schedule/runner.py tests/schedule/test_runner.py
git commit -m "feat: ScheduleRunner (APScheduler) 実装"
```

---

## Phase 7: 配線 + エントリポイント

### Task 17: bot.py (Discord.py クライアント)

**Files:**
- Create: `src/bot.py`
- Create: `tests/test_bot.py`

**Step 1: テストを書く**

```python
# tests/test_bot.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

async def test_ignores_bot_messages():
    from src.bot import create_bot
    send_fn = AsyncMock()
    bot = create_bot(on_mention=send_fn, on_message=AsyncMock())

    mock_msg = MagicMock()
    mock_msg.author.bot = True
    mock_msg.mentions = []

    await bot._on_message_handler(mock_msg)
    send_fn.assert_not_called()

async def test_responds_to_mention():
    from src.bot import create_bot
    send_fn = AsyncMock()
    bot = create_bot(on_mention=send_fn, on_message=AsyncMock())

    mock_msg = MagicMock()
    mock_msg.author.bot = False
    mock_msg.content = "<@123> hello"
    mock_msg.channel.id = "ch1"
    mock_msg.channel.send = AsyncMock()
    mock_msg.channel.typing = MagicMock(return_value=AsyncMock().__aenter__.return_value)

    bot_user = MagicMock()
    bot_user.id = 123
    mock_msg.mentions = [bot_user]

    with patch.object(bot._client, "user", bot_user):
        await bot._on_message_handler(mock_msg)
    send_fn.assert_called_once()
```

**Step 2: テストが失敗することを確認**

```bash
pytest tests/test_bot.py -v
```

**Step 3: bot.py を実装**

```python
# src/bot.py
import re
import asyncio
from typing import Callable, Awaitable
import discord
from src.discord.splitter import split_message

OnMentionFn = Callable[[str, str], Awaitable[str]]
OnMessageFn = Callable[[object], Awaitable[None]]

class DiscordBot:
    def __init__(self, on_mention: OnMentionFn, on_message: OnMessageFn) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        self._client = discord.Client(intents=intents)
        self._on_mention = on_mention
        self._on_message_reaction = on_message
        self._setup_events()

    def _setup_events(self) -> None:
        @self._client.event
        async def on_message(message: discord.Message) -> None:
            await self._on_message_handler(message)

    async def _on_message_handler(self, message: discord.Message) -> None:
        if message.author.bot:
            return

        # リアクション処理（全メッセージ対象、非同期）
        asyncio.create_task(self._on_message_reaction(message))

        # メンション処理
        if self._client.user not in message.mentions:
            return

        prompt = re.sub(r"<@!?\d+>", "", message.content).strip()
        if not prompt:
            return

        async with message.channel.typing():
            response = await self._on_mention(prompt, str(message.channel.id))

        for part in split_message(response):
            await message.channel.send(part)

    def run(self, token: str) -> None:
        self._client.run(token)

def create_bot(on_mention: OnMentionFn, on_message: OnMessageFn) -> DiscordBot:
    return DiscordBot(on_mention=on_mention, on_message=on_message)
```

**Step 4: テスト確認**

```bash
pytest tests/test_bot.py -v
```

**Step 5: Commit**

```bash
git add src/bot.py tests/test_bot.py
git commit -m "feat: DiscordBot クライアント実装"
```

---

### Task 18: main.py (エントリポイント・全配線)

**Files:**
- Create: `src/main.py`

**Step 1: main.py を実装**

```python
# src/main.py
import asyncio
from src import config
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore
from src.stores.tone import ToneStore
from src.stores.calendar import CalendarStore
from src.stores.channel import ChannelStore
from src.stores.schedule import ScheduleStore
from src.discord.reaction_handler import ReactionHandler
from src.commands.router import CommandRouter
from src.commands.clear import handle_clear
from src.commands.tone import handle_tone
from src.commands.calendar import handle_calendar
from src.commands.channel import handle_channel
from src.schedule.runner import ScheduleRunner
from src.bot import create_bot

def build_agent() -> AgentHandler:
    system_prompt = config.DISCORD_BOT_PROMPT
    if config.AGENT_TYPE == "claude":
        from src.agents.claude import ClaudeAgent
        return ClaudeAgent(
            api_key=config.ANTHROPIC_API_KEY,
            model=config.CLAUDE_MODEL,
            system_prompt=system_prompt,
        )
    elif config.AGENT_TYPE == "gemini":
        from src.agents.gemini import GeminiAgent
        return GeminiAgent(
            api_key=config.GOOGLE_API_KEY,
            model=config.GEMINI_MODEL,
            system_prompt=system_prompt,
        )
    elif config.AGENT_TYPE == "codex":
        from src.agents.codex import CodexAgent
        return CodexAgent(work_dir=config.AGENT_WORK_DIR)
    else:  # qwen (default)
        from src.agents.qwen import QwenAgent
        return QwenAgent(
            api_url=config.OLLAMA_API_URL,
            model=config.OLLAMA_MODEL,
            system_prompt=system_prompt,
        )

def main() -> None:
    agent = build_agent()
    history_store = HistoryStore()
    tone_store = ToneStore()
    calendar_store = CalendarStore()
    channel_store = ChannelStore()
    schedule_store = ScheduleStore()

    # リアクションハンドラー（軽量モデルで判定）
    reaction_agent = build_agent()  # 同じモデルを使用
    reaction_handler = ReactionHandler(agent=reaction_agent)

    # コマンドルーター
    router = CommandRouter()
    router.register("!clear", lambda ch, u, a: handle_clear(history_store, ch, u, a))
    router.register("!tone", lambda ch, u, a: handle_tone(tone_store, ch, u, a))
    router.register("!calendar", lambda ch, u, a: handle_calendar(calendar_store, ch, u, a))
    router.register("!channel", lambda ch, u, a: handle_channel(channel_store, ch, u, a))

    async def on_mention(prompt: str, channel_id: str) -> str:
        # コマンドチェック
        if router.is_command(prompt):
            result = await router.dispatch(prompt, channel_id, "")
            return result or "不明なコマンドです"
        # チャンネル制限チェック
        if not channel_store.is_allowed(channel_id):
            return "このチャンネルではbotは無効です"
        return await agent.ask(prompt, channel_id)

    # スケジューラー
    async def send_scheduled(channel_id: str, message: str) -> None:
        response = await agent.ask(message, channel_id)
        # bot経由で送信（省略: botインスタンスからget_channelを使う）
        print(f"Scheduled [{channel_id}]: {response}")

    schedule_runner = ScheduleRunner(send_message=send_scheduled, store=schedule_store)
    schedule_runner.start()

    bot = create_bot(
        on_mention=on_mention,
        on_message=reaction_handler.handle,
    )
    bot.run(config.DISCORD_TOKEN)

if __name__ == "__main__":
    main()
```

**Step 2: 起動テスト（環境変数なし）**

```bash
DISCORD_TOKEN="" python -c "import src.main" 2>&1 | grep -i "error\|discord_token"
```

Expected: DISCORD_TOKEN のエラーが出る（正常動作）

**Step 3: Commit**

```bash
git add src/main.py
git commit -m "feat: main.py エントリポイント・全配線"
```

---

### Task 19: 全テスト確認 + CI設定

**Files:**
- Create: `.github/workflows/test.yml`（オプション）

**Step 1: 全テストを実行**

```bash
pytest tests/ -v --tb=short
```

Expected: 全テストがPASS

**Step 2: カバレッジ確認**

```bash
pytest tests/ --cov=src --cov-report=term-missing
```

**Step 3: 型チェック**

```bash
pip install mypy
mypy src/ --ignore-missing-imports
```

**Step 4: 最終 Commit**

```bash
git add .
git commit -m "chore: Python/Qwen-Agent移行完了 - 全テストPass"
```

---

## 完了チェックリスト

- [ ] `pytest tests/ -v` で全テストPASS
- [ ] `python -m src.main` で起動確認（DISCORD_TOKENがない場合はValueError）
- [ ] Discord上で `@bot` メンションに応答する
- [ ] `!clear`, `!tone`, `!calendar`, `!channel` コマンドが動作する
- [ ] チャンネルの全メッセージにLLMが適宜リアクションをつける
- [ ] `AGENT_TYPE=claude/gemini/codex/qwen` の切り替えが動作する
