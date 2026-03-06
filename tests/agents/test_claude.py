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


async def test_ask_with_images(agent):
    # Given: 画像付きメッセージ
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="画像の説明")]
    images = [(b"\x89PNG\r\n", "image/png")]

    with patch.object(agent._client.messages, "create", return_value=mock_message) as mock_create:
        result = await agent.ask("この画像は？", "ch1", images)

    # Then: messages に画像ブロックが含まれる
    sent = mock_create.call_args[1]["messages"]
    user_content = sent[-1]["content"]
    assert any(b.get("type") == "image" for b in user_content)
    assert result == "画像の説明"
