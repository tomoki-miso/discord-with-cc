import pytest
from src.stores.whimsy import WhimsyStore
from src.commands.whimsy import handle_whimsy


async def test_enable():
    store = WhimsyStore()
    result = await handle_whimsy(store, "ch1", "", "on")
    assert store.is_enabled("ch1") is True
    assert "有効" in result


async def test_disable():
    store = WhimsyStore()
    store.enable("ch1")
    result = await handle_whimsy(store, "ch1", "", "off")
    assert store.is_enabled("ch1") is False
    assert "無効" in result


async def test_status_on():
    store = WhimsyStore()
    store.enable("ch1")
    result = await handle_whimsy(store, "ch1", "", "")
    assert "有効" in result


async def test_status_off():
    store = WhimsyStore()
    result = await handle_whimsy(store, "ch1", "", "")
    assert "無効" in result
