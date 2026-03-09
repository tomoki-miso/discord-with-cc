import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.stores.channel import ChannelStore
from src.stores.whimsy import WhimsyStore
from src.discord.splitter import split_message


def _make_message(content: str, channel_id: str) -> MagicMock:
    mock_channel = AsyncMock()
    mock_channel.id = channel_id
    mock_channel.send = AsyncMock()
    mock_channel.typing = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(), __aexit__=AsyncMock()))
    msg = MagicMock()
    msg.content = content
    msg.channel = mock_channel
    return msg


async def _make_on_random_message(agent, channel_store, whimsy_store, threshold: int = 5):
    """main.py の on_random_message と同等のロジックを再現"""
    import random
    WHIMSY_PROBABILITY = 0.20

    async def on_random_message(message):
        channel_id = str(getattr(getattr(message, "channel", None), "id", ""))
        content = getattr(message, "content", "").strip()

        if channel_store.is_allowed(channel_id) and content:
            try:
                score = await agent.score_context(content)
                if score >= threshold:
                    channel = getattr(message, "channel", None)
                    if channel:
                        async with channel.typing():
                            response = await agent.ask(content, channel_id)
                        for part in split_message(response):
                            await channel.send(part)
                    return
            except Exception:
                pass

        if not whimsy_store.is_enabled(channel_id):
            return
        if random.random() >= WHIMSY_PROBABILITY:
            return
        if not content:
            return
        response = await agent.ask(content, channel_id)
        channel = getattr(message, "channel", None)
        if channel:
            for part in split_message(response):
                await channel.send(part)

    return on_random_message


async def test_context_detection_calls_ask_when_score_above_threshold(tmp_path):
    """スコアが閾値以上のとき agent.ask が呼ばれる"""
    channel_store = ChannelStore(path=str(tmp_path / "channels.json"))
    channel_store.add("ch1")
    whimsy_store = WhimsyStore()

    agent = AsyncMock()
    agent.score_context = AsyncMock(return_value=7)
    agent.ask = AsyncMock(return_value="はい、教えます")

    msg = _make_message("これを教えてください", "ch1")
    on_random_message = await _make_on_random_message(agent, channel_store, whimsy_store, threshold=5)

    await on_random_message(msg)

    agent.ask.assert_called_once_with("これを教えてください", "ch1")
    msg.channel.send.assert_called_once_with("はい、教えます")


async def test_context_detection_skips_ask_when_score_below_threshold(tmp_path):
    """スコアが閾値未満のとき agent.ask は呼ばれない（whimsy も無効）"""
    channel_store = ChannelStore(path=str(tmp_path / "channels.json"))
    channel_store.add("ch1")
    whimsy_store = WhimsyStore()  # whimsy 無効

    agent = AsyncMock()
    agent.score_context = AsyncMock(return_value=2)

    msg = _make_message("今日いい天気だね", "ch1")
    on_random_message = await _make_on_random_message(agent, channel_store, whimsy_store, threshold=5)

    with patch("random.random", return_value=0.99):  # whimsy も外れる
        await on_random_message(msg)

    agent.ask.assert_not_called()


async def test_context_detection_skips_disallowed_channel(tmp_path):
    """許可されていないチャンネルは文脈検出をスキップする"""
    channel_store = ChannelStore(path=str(tmp_path / "channels.json"))
    # ch1 を allow しない
    whimsy_store = WhimsyStore()

    agent = AsyncMock()
    agent.score_context = AsyncMock(return_value=9)

    msg = _make_message("教えてください", "ch1")
    on_random_message = await _make_on_random_message(agent, channel_store, whimsy_store, threshold=5)

    with patch("random.random", return_value=0.99):
        await on_random_message(msg)

    agent.score_context.assert_not_called()
    agent.ask.assert_not_called()


async def test_context_detection_falls_through_to_whimsy_when_below_threshold(tmp_path):
    """スコアが閾値未満のとき Whimsy ロジックにフォールバックする"""
    channel_store = ChannelStore(path=str(tmp_path / "channels.json"))
    channel_store.add("ch1")
    whimsy_store = WhimsyStore()
    whimsy_store.enable("ch1")

    agent = AsyncMock()
    agent.score_context = AsyncMock(return_value=2)
    agent.ask = AsyncMock(return_value="気まぐれ返答")

    msg = _make_message("いい天気", "ch1")
    on_random_message = await _make_on_random_message(agent, channel_store, whimsy_store, threshold=5)

    with patch("random.random", return_value=0.05):  # whimsy 確率内
        await on_random_message(msg)

    agent.ask.assert_called_once_with("いい天気", "ch1")


async def test_context_detection_continues_on_score_context_error(tmp_path):
    """score_context が例外を投げても Whimsy ロジックに継続する"""
    channel_store = ChannelStore(path=str(tmp_path / "channels.json"))
    channel_store.add("ch1")
    whimsy_store = WhimsyStore()
    whimsy_store.enable("ch1")

    agent = AsyncMock()
    agent.score_context = AsyncMock(side_effect=RuntimeError("API error"))
    agent.ask = AsyncMock(return_value="フォールバック返答")

    msg = _make_message("テスト", "ch1")
    on_random_message = await _make_on_random_message(agent, channel_store, whimsy_store, threshold=5)

    with patch("random.random", return_value=0.05):
        await on_random_message(msg)  # 例外が伝播しないことを確認

    agent.ask.assert_called_once()
