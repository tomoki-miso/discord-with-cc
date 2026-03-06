import pytest
from unittest.mock import MagicMock, patch
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
