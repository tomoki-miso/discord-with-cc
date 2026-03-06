import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from google.genai import types
from src.agents.gemini import GeminiAgent


@pytest.fixture
def agent():
    with patch("google.genai.Client"):
        yield GeminiAgent(api_key="test-key", model="gemini-2.0-flash", system_prompt="テスト")


def _mock_chat(text: str) -> MagicMock:
    mock_chat = MagicMock()
    mock_response = MagicMock()
    mock_response.text = text
    mock_response.candidates[0].grounding_metadata = None
    mock_chat.send_message.return_value = mock_response
    return mock_chat


async def test_ask_returns_response(agent):
    # Given: モックチャットが "Gemini応答" を返す
    mock_chat = _mock_chat("Gemini応答")
    agent._client.chats.create.return_value = mock_chat

    result = await agent.ask("hello", "ch1")

    assert result == "Gemini応答"


async def test_ask_with_images(agent):
    # Given: 画像付きメッセージ
    mock_chat = _mock_chat("画像の内容です")
    agent._client.chats.create.return_value = mock_chat
    images = [(b"\x89PNG\r\n", "image/png")]

    result = await agent.ask("この画像は？", "ch1", images)

    # Then: send_message に画像パートとテキストが渡される
    parts = mock_chat.send_message.call_args[0][0]
    assert any(
        isinstance(p, types.Part)
        and p.inline_data is not None
        and p.inline_data.mime_type == "image/png"
        for p in parts
    )
    assert result == "画像の内容です"


async def test_history_accumulates(agent):
    # Given: 1回質問する
    mock_chat = _mock_chat("応答1")
    agent._client.chats.create.return_value = mock_chat

    await agent.ask("質問1", "ch1")

    # Then: user + model の2メッセージが保存される
    assert len(agent._store.get("ch1")) == 2


async def test_history_passed_to_next_call(agent):
    # Given: 1回目の応答を保存
    agent._client.chats.create.return_value = _mock_chat("応答1")
    await agent.ask("質問1", "ch1")

    # When: 2回目の呼び出し
    agent._client.chats.create.return_value = _mock_chat("応答2")
    await agent.ask("質問2", "ch1")

    # Then: chats.create に過去の履歴が渡される
    called_history = agent._client.chats.create.call_args[1]["history"]
    assert len(called_history) == 2


async def test_clear_history(agent):
    # Given: 履歴がある状態
    agent._store.set("ch1", [types.Content(role="user", parts=[types.Part(text="test")])])

    # When: クリア
    agent.clear_history("ch1")

    # Then: 空になる
    assert agent._store.get("ch1") == []


async def test_citations_appended_when_grounding_present(agent):
    # Given: グラウンディングメタデータ付きのレスポンス
    mock_chat = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "カニは甲殻類ですミソ"
    chunk1 = MagicMock()
    chunk1.web.uri = "https://example.com/crab"
    chunk1.web.title = "カニの生態"
    chunk2 = MagicMock()
    chunk2.web.uri = "https://example.com/crab"  # 重複は1件に
    chunk2.web.title = "カニの生態"
    mock_response.candidates[0].grounding_metadata.grounding_chunks = [chunk1, chunk2]
    mock_chat.send_message.return_value = mock_response
    agent._client.chats.create.return_value = mock_chat

    result = await agent.ask("カニとは？", "ch1")

    assert "**参考:**" in result
    assert "https://example.com/crab" in result
    assert result.count("https://example.com/crab") == 1  # 重複排除


async def test_search_queries_shown_when_chunks_unavailable(agent):
    # Given: APIキー制限でgrounding_chunksがNone・web_search_queriesのみ返る（AI Developer API）
    mock_chat = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "韓国のGDPはミソ"
    mock_response.candidates[0].grounding_metadata.grounding_chunks = None
    mock_response.candidates[0].grounding_metadata.web_search_queries = ["韓国 GDP"]
    mock_chat.send_message.return_value = mock_response
    agent._client.chats.create.return_value = mock_chat

    result = await agent.ask("韓国のGDPは？", "ch1")

    assert "🔍" in result
    assert "韓国 GDP" in result


async def test_no_citations_when_no_grounding(agent):
    # Given: グラウンディングなし（grounding_metadata が None）
    mock_chat = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "通常の応答ミソ"
    mock_response.candidates[0].grounding_metadata = None
    mock_chat.send_message.return_value = mock_response
    agent._client.chats.create.return_value = mock_chat

    result = await agent.ask("hello", "ch1")

    assert "**参考:**" not in result
    assert "🔍" not in result


async def test_blocked_response_returns_filter_message(agent):
    # Given: Gemini の安全フィルターが反応し、.text が ValueError を raise する
    mock_chat = MagicMock()
    mock_response = MagicMock()
    type(mock_response).text = PropertyMock(side_effect=ValueError("blocked"))
    mock_response.candidates = []
    mock_chat.send_message.return_value = mock_response
    agent._client.chats.create.return_value = mock_chat

    result = await agent.ask("😊", "ch1")

    assert result == "（コンテンツフィルターにより応答できませんでした）"


async def test_google_search_tool_configured(agent):
    # Then: Google Search ツールが設定されている
    tools = agent._config.tools
    assert any(
        isinstance(t, types.Tool) and t.google_search is not None
        for t in tools
    )


async def test_long_url_shown_without_link(agent):
    # Given: 500文字を超えるURL（Vertex AI リダイレクトURL模倣）
    mock_chat = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "応答テキスト"
    chunk = MagicMock()
    chunk.web.uri = "https://vertexaisearch.cloud.google.com/" + "a-k" * 200
    chunk.web.title = "長いURLのサイト"
    mock_response.candidates[0].grounding_metadata.grounding_chunks = [chunk]
    mock_chat.send_message.return_value = mock_response
    agent._client.chats.create.return_value = mock_chat

    result = await agent.ask("何か？", "ch1")

    # Then: タイトルは表示、URLはリンクにならない
    assert "**参考:**" in result
    assert "長いURLのサイト" in result
    assert "vertexaisearch.cloud.google.com" not in result
