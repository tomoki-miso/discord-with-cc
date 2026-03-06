import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock


async def test_ignores_bot_messages():
    from src.bot import create_bot
    send_fn = AsyncMock()
    bot = create_bot(on_mention=send_fn, on_message=AsyncMock())

    mock_msg = MagicMock()
    mock_msg.author.bot = True
    mock_msg.mentions = []

    await bot._on_message_handler(mock_msg)
    send_fn.assert_not_called()


async def test_sends_error_message_when_on_mention_raises():
    from src.bot import create_bot
    send_fn = AsyncMock(side_effect=RuntimeError("API error"))
    bot = create_bot(on_mention=send_fn, on_message=AsyncMock())

    mock_msg = MagicMock()
    mock_msg.author.bot = False
    mock_msg.content = "<@123> 😊"
    mock_msg.channel.id = "ch1"
    mock_msg.channel.send = AsyncMock()
    mock_msg.channel.typing = MagicMock(
        return_value=MagicMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=None),
        )
    )

    bot_user = MagicMock()
    bot_user.id = 123
    mock_msg.mentions = [bot_user]

    with patch.object(type(bot._client), "user", new_callable=PropertyMock, return_value=bot_user):
        await bot._on_message_handler(mock_msg)

    mock_msg.channel.send.assert_called_once()
    sent_text = mock_msg.channel.send.call_args[0][0]
    assert "エラーが発生しました" in sent_text


async def test_responds_to_mention():
    from src.bot import create_bot
    send_fn = AsyncMock(return_value="テスト応答")
    bot = create_bot(on_mention=send_fn, on_message=AsyncMock())

    mock_msg = MagicMock()
    mock_msg.author.bot = False
    mock_msg.content = "<@123> hello"
    mock_msg.channel.id = "ch1"
    mock_msg.channel.send = AsyncMock()
    mock_msg.channel.typing = MagicMock(
        return_value=MagicMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=None),
        )
    )

    bot_user = MagicMock()
    bot_user.id = 123
    mock_msg.mentions = [bot_user]

    with patch.object(type(bot._client), "user", new_callable=PropertyMock, return_value=bot_user):
        await bot._on_message_handler(mock_msg)
    send_fn.assert_called_once()


async def test_whimsy_callback_called_on_non_mention():
    from src.bot import create_bot
    from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

    on_mention = AsyncMock(return_value="応答")
    on_message = AsyncMock()
    on_random = AsyncMock()
    bot = create_bot(on_mention=on_mention, on_message=on_message, on_random_message=on_random)

    mock_msg = MagicMock()
    mock_msg.author.bot = False
    mock_msg.content = "hello"
    mock_msg.mentions = []
    mock_msg.attachments = []

    bot_user = MagicMock()
    bot_user.id = 123
    with patch.object(type(bot._client), "user", new_callable=PropertyMock, return_value=bot_user):
        await bot._on_message_handler(mock_msg)

    on_random.assert_called_once_with(mock_msg)
