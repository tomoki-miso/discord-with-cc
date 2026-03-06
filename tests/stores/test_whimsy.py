from src.stores.whimsy import WhimsyStore


def test_disabled_by_default():
    store = WhimsyStore()
    assert store.is_enabled("ch1") is False


def test_enable_channel():
    store = WhimsyStore()
    store.enable("ch1")
    assert store.is_enabled("ch1") is True
    assert store.is_enabled("ch2") is False


def test_disable_channel():
    store = WhimsyStore()
    store.enable("ch1")
    store.disable("ch1")
    assert store.is_enabled("ch1") is False
