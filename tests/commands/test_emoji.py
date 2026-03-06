import pytest
from src.stores.emoji import NoEmojiStore
from src.commands.emoji import handle_emoji


@pytest.fixture
def store() -> NoEmojiStore:
    return NoEmojiStore()


async def test_off_disables_emoji(store):
    result = await handle_emoji(store, "ch1", "", "off")
    assert store.is_disabled("ch1") is True
    assert "使いません" in result


async def test_on_enables_emoji(store):
    store.disable("ch1")
    result = await handle_emoji(store, "ch1", "", "on")
    assert store.is_disabled("ch1") is False
    assert "使います" in result


async def test_status_shows_off(store):
    store.disable("ch1")
    result = await handle_emoji(store, "ch1", "", "")
    assert "OFF" in result


async def test_status_shows_on_by_default(store):
    result = await handle_emoji(store, "ch1", "", "")
    assert "ON" in result
