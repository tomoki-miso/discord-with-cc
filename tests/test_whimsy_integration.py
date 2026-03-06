import pytest
from unittest.mock import AsyncMock, MagicMock, patch


async def test_whimsy_responds_when_random_hits(tmp_path):
    """random が確率以下のとき agent.ask が呼ばれる"""
    from src.stores.whimsy import WhimsyStore
    from src.discord.splitter import split_message

    store = WhimsyStore()
    store.enable("ch1")
    agent = AsyncMock()
    agent.ask = AsyncMock(return_value="気まぐれ返答")

    mock_channel = AsyncMock()
    mock_channel.id = "ch1"
    mock_channel.send = AsyncMock()

    mock_msg = MagicMock()
    mock_msg.content = "hello"
    mock_msg.channel = mock_channel

    async def on_random_message(message):
        channel_id = str(message.channel.id)
        if not store.is_enabled(channel_id):
            return
        import random as r
        if r.random() >= 0.20:
            return
        content = message.content.strip()
        if not content:
            return
        response = await agent.ask(content, channel_id)
        for part in split_message(response):
            await message.channel.send(part)

    with patch("random.random", return_value=0.05):  # 確率以下
        await on_random_message(mock_msg)

    agent.ask.assert_called_once_with("hello", "ch1")
    mock_channel.send.assert_called_once_with("気まぐれ返答")


async def test_whimsy_skips_when_random_misses():
    """random が確率以上のとき agent.ask は呼ばれない"""
    from src.stores.whimsy import WhimsyStore

    store = WhimsyStore()
    store.enable("ch1")
    agent = AsyncMock()

    mock_channel = MagicMock()
    mock_channel.id = "ch1"
    mock_msg = MagicMock()
    mock_msg.content = "hello"
    mock_msg.channel = mock_channel

    async def on_random_message(message):
        channel_id = str(message.channel.id)
        if not store.is_enabled(channel_id):
            return
        import random as r
        if r.random() >= 0.20:
            return
        await agent.ask(message.content, channel_id)

    with patch("random.random", return_value=0.50):  # 確率以上
        await on_random_message(mock_msg)

    agent.ask.assert_not_called()


async def test_whimsy_skips_when_disabled():
    """whimsy が off のとき呼ばれない"""
    from src.stores.whimsy import WhimsyStore

    store = WhimsyStore()  # enabled なし
    agent = AsyncMock()

    mock_channel = MagicMock()
    mock_channel.id = "ch1"
    mock_msg = MagicMock()
    mock_msg.content = "hello"
    mock_msg.channel = mock_channel

    async def on_random_message(message):
        channel_id = str(message.channel.id)
        if not store.is_enabled(channel_id):
            return
        await agent.ask(message.content, channel_id)

    await on_random_message(mock_msg)

    agent.ask.assert_not_called()
