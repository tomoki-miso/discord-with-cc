import pytest
from unittest.mock import AsyncMock, MagicMock
from src.discord.reaction_handler import ReactionHandler


@pytest.fixture
def handler():
    mock_agent = MagicMock()
    mock_agent.ask = AsyncMock(return_value="👍")
    return ReactionHandler(agent=mock_agent, rate_limit_seconds=0)


async def test_adds_reaction_when_emoji_returned(handler):
    mock_message = AsyncMock()
    mock_message.content = "今日もいい天気ですね"
    mock_message.author.bot = False

    await handler.handle(mock_message)

    mock_message.add_reaction.assert_called_once_with("👍")


async def test_skips_bot_messages(handler):
    mock_message = AsyncMock()
    mock_message.author.bot = True

    await handler.handle(mock_message)

    mock_message.add_reaction.assert_not_called()


async def test_skips_when_no_reaction(handler):
    handler._agent.ask = AsyncMock(return_value="なし")
    mock_message = AsyncMock()
    mock_message.content = "..."
    mock_message.author.bot = False

    await handler.handle(mock_message)

    mock_message.add_reaction.assert_not_called()


async def test_rate_limit_prevents_spam():
    mock_agent = MagicMock()
    mock_agent.ask = AsyncMock(return_value="👍")
    handler = ReactionHandler(agent=mock_agent, rate_limit_seconds=60)

    mock_message = AsyncMock()
    mock_message.content = "test"
    mock_message.author.bot = False
    mock_message.channel.id = "ch1"

    await handler.handle(mock_message)
    await handler.handle(mock_message)

    assert mock_message.add_reaction.call_count == 1
