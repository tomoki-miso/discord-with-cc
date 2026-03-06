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
