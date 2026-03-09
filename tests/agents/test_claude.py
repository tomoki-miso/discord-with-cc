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


async def test_score_context_returns_integer(agent):
    # Given: LLM が "7" を返す
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="7")]

    with patch.object(agent._client.messages, "create", return_value=mock_message):
        result = await agent.score_context("何か教えて")

    assert result == 7


async def test_score_context_clamps_to_range(agent):
    # Given: LLM が範囲外の値を返す
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="99")]

    with patch.object(agent._client.messages, "create", return_value=mock_message):
        result = await agent.score_context("hello")

    assert result == 10


async def test_score_context_returns_zero_on_invalid(agent):
    # Given: LLM が数値以外を返す
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="not a number")]

    with patch.object(agent._client.messages, "create", return_value=mock_message):
        result = await agent.score_context("hello")

    assert result == 0


async def test_score_context_does_not_modify_history(agent):
    # Given: 事前に履歴がある
    agent._store.set("ch1", [{"role": "user", "content": "既存"}])
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="5")]

    with patch.object(agent._client.messages, "create", return_value=mock_message):
        await agent.score_context("テスト")

    # Then: 履歴は変わっていない
    assert len(agent._store.get("ch1")) == 1
