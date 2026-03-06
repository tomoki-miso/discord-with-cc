from src.stores.history import HistoryStore


def test_empty_history_on_new_channel():
    store = HistoryStore()
    assert store.get("ch1") == []


def test_append_and_get():
    store = HistoryStore()
    store.append("ch1", {"role": "user", "content": "hello"})
    assert store.get("ch1") == [{"role": "user", "content": "hello"}]


def test_clear_resets_history():
    store = HistoryStore()
    store.append("ch1", {"role": "user", "content": "hello"})
    store.clear("ch1")
    assert store.get("ch1") == []


def test_clear_increments_generation():
    store = HistoryStore()
    gen1 = store.generation("ch1")
    store.clear("ch1")
    assert store.generation("ch1") == gen1 + 1


def test_channels_are_isolated():
    store = HistoryStore()
    store.append("ch1", {"role": "user", "content": "a"})
    assert store.get("ch2") == []
