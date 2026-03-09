import pytest
from unittest.mock import MagicMock, patch
from src.agents.qwen import QwenAgent


@pytest.fixture
def agent():
    with patch("src.agents.qwen.Assistant") as mock_cls:
        mock_cls.return_value = MagicMock()
        a = QwenAgent(
            api_url="http://localhost:11434",
            model="qwen2.5:14b",
            system_prompt="テスト用プロンプト",
        )
    return a


async def test_ask_returns_string(agent):
    mock_response = [{"role": "assistant", "content": [{"text": "こんにちは"}]}]
    agent._assistant.run.return_value = iter([mock_response])
    result = await agent.ask("hello", "ch1")
    assert isinstance(result, str)
    assert "こんにちは" in result


async def test_clear_history(agent):
    agent._history["ch1"] = [{"role": "user", "content": "test"}]
    agent.clear_history("ch1")
    assert agent._history.get("ch1") is None


async def test_score_context_returns_integer(agent):
    # Given: _run_sync が "7" を返す
    agent._assistant.run.return_value = iter([[{"role": "assistant", "content": "7"}]])

    result = await agent.score_context("何か教えて")

    assert result == 7


async def test_score_context_extracts_number_from_mixed_text(agent):
    # Given: _run_sync が "スコアは 5 です" のような応答を返す
    agent._assistant.run.return_value = iter([[{"role": "assistant", "content": "スコアは 5 です"}]])

    result = await agent.score_context("ねえ教えて")

    assert result == 5


async def test_score_context_returns_zero_when_no_number(agent):
    # Given: _run_sync が数値なし文字列を返す
    agent._assistant.run.return_value = iter([[{"role": "assistant", "content": "応答なし"}]])

    result = await agent.score_context("hello")

    assert result == 0


async def test_score_context_does_not_modify_history(agent):
    # Given: 事前の履歴がない
    agent._assistant.run.return_value = iter([[{"role": "assistant", "content": "3"}]])

    await agent.score_context("テスト")

    # Then: _history には何も追加されていない
    assert agent._history == {}
