import pytest
from src.stores.reaction import NoReactionStore
from src.commands.reaction import handle_reaction


@pytest.fixture
def store() -> NoReactionStore:
    return NoReactionStore()


async def test_off_disables_reaction(store):
    result = await handle_reaction(store, "ch1", "", "off")
    assert store.is_disabled("ch1") is True
    assert "しません" in result


async def test_on_enables_reaction(store):
    store.disable("ch1")
    result = await handle_reaction(store, "ch1", "", "on")
    assert store.is_disabled("ch1") is False
    assert "再開" in result


async def test_status_shows_off(store):
    store.disable("ch1")
    result = await handle_reaction(store, "ch1", "", "")
    assert "OFF" in result


async def test_status_shows_on_by_default(store):
    result = await handle_reaction(store, "ch1", "", "")
    assert "ON" in result
