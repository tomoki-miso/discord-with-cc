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


async def test_whimsy_injects_channel_history():
    """channel.history の過去メッセージを set_history で注入してから ask する"""
    from src.stores.whimsy import WhimsyStore
    from src.discord.splitter import split_message

    store = WhimsyStore()
    store.enable("ch1")
    agent = AsyncMock()
    agent.ask = AsyncMock(return_value="返答")
    agent.set_history = MagicMock()

    # 過去メッセージ: 新しい順で2件（history() は新しい順に返す）
    past1 = MagicMock()
    past1.content = "ユーザーの発言"
    past1.author = MagicMock(bot=False)

    past2 = MagicMock()
    past2.content = "Botの発言"
    past2.author = MagicMock(bot=True)

    async def mock_history(limit, before):
        yield past1
        yield past2

    mock_channel = AsyncMock()
    mock_channel.id = "ch1"
    mock_channel.history = mock_history

    mock_msg = MagicMock()
    mock_msg.content = "現在のメッセージ"
    mock_msg.channel = mock_channel

    async def on_random_message(message):
        channel = getattr(message, "channel", None)
        channel_id = str(getattr(channel, "id", ""))
        if not store.is_enabled(channel_id):
            return
        import random as r
        if r.random() >= 0.20:
            return
        content = getattr(message, "content", "").strip()
        if not content:
            return
        if channel:
            past: list[dict] = []
            async for msg in channel.history(limit=10, before=message):
                is_bot = getattr(getattr(msg, "author", None), "bot", False)
                msg_content = getattr(msg, "content", "").strip()
                if not msg_content:
                    continue
                past.insert(0, {"role": "assistant" if is_bot else "user", "content": msg_content})
            merged: list[dict] = []
            for entry in past:
                if merged and merged[-1]["role"] == entry["role"]:
                    merged[-1]["content"] += "\n" + entry["content"]
                else:
                    merged.append(entry)
            agent.set_history(channel_id, merged)
        response = await agent.ask(content, channel_id)
        for part in split_message(response):
            await channel.send(part)

    with patch("random.random", return_value=0.05):
        await on_random_message(mock_msg)

    # history() は新しい順（past1→past2）なので insert(0) で逆順になる → [past2, past1]
    agent.set_history.assert_called_once_with(
        "ch1",
        [
            {"role": "assistant", "content": "Botの発言"},
            {"role": "user", "content": "ユーザーの発言"},
        ],
    )
    agent.ask.assert_called_once_with("現在のメッセージ", "ch1")


async def test_whimsy_merges_consecutive_same_role():
    """連続する同ロールのメッセージを結合する"""
    from src.stores.whimsy import WhimsyStore

    store = WhimsyStore()
    store.enable("ch1")
    agent = AsyncMock()
    agent.ask = AsyncMock(return_value="返答")
    agent.set_history = MagicMock()

    # 連続してユーザー2人が発言
    msg_a = MagicMock()
    msg_a.content = "発言A"
    msg_a.author = MagicMock(bot=False)

    msg_b = MagicMock()
    msg_b.content = "発言B"
    msg_b.author = MagicMock(bot=False)

    async def mock_history(limit, before):
        yield msg_a
        yield msg_b

    mock_channel = AsyncMock()
    mock_channel.id = "ch1"
    mock_channel.history = mock_history

    mock_msg = MagicMock()
    mock_msg.content = "質問"
    mock_msg.channel = mock_channel

    async def on_random_message(message):
        channel = getattr(message, "channel", None)
        channel_id = str(getattr(channel, "id", ""))
        if not store.is_enabled(channel_id):
            return
        import random as r
        if r.random() >= 0.20:
            return
        content = getattr(message, "content", "").strip()
        if not content:
            return
        if channel:
            past: list[dict] = []
            async for msg in channel.history(limit=10, before=message):
                is_bot = getattr(getattr(msg, "author", None), "bot", False)
                msg_content = getattr(msg, "content", "").strip()
                if not msg_content:
                    continue
                past.insert(0, {"role": "assistant" if is_bot else "user", "content": msg_content})
            merged: list[dict] = []
            for entry in past:
                if merged and merged[-1]["role"] == entry["role"]:
                    merged[-1]["content"] += "\n" + entry["content"]
                else:
                    merged.append(entry)
            agent.set_history(channel_id, merged)
        await agent.ask(content, channel_id)

    with patch("random.random", return_value=0.05):
        await on_random_message(mock_msg)

    # 2件のユーザー発言が1件に結合される
    agent.set_history.assert_called_once_with(
        "ch1",
        [{"role": "user", "content": "発言B\n発言A"}],
    )


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
