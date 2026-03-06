import pytest
from unittest.mock import AsyncMock
from src.commands.router import CommandRouter


async def test_dispatch_known_command():
    router = CommandRouter()
    handler = AsyncMock(return_value="OK")
    router.register("!clear", handler)

    result = await router.dispatch("!clear", "ch1", "user1")
    assert result == "OK"
    handler.assert_called_once_with("ch1", "user1", "")


async def test_dispatch_with_args():
    router = CommandRouter()
    handler = AsyncMock(return_value="設定済み")
    router.register("!tone", handler)

    result = await router.dispatch("!tone 丁寧語", "ch1", "user1")
    assert result == "設定済み"
    handler.assert_called_once_with("ch1", "user1", "丁寧語")


async def test_dispatch_unknown_returns_none():
    router = CommandRouter()
    result = await router.dispatch("!unknown", "ch1", "user1")
    assert result is None


def test_is_command():
    router = CommandRouter()
    router.register("!clear", AsyncMock())
    assert router.is_command("!clear") is True
    assert router.is_command("hello") is False
