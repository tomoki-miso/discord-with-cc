from src.stores.emoji import NoEmojiStore


def test_emoji_enabled_by_default():
    store = NoEmojiStore()
    assert store.is_disabled("ch1") is False


def test_disable_emoji():
    store = NoEmojiStore()
    store.disable("ch1")
    assert store.is_disabled("ch1") is True


def test_enable_emoji_after_disable():
    store = NoEmojiStore()
    store.disable("ch1")
    store.enable("ch1")
    assert store.is_disabled("ch1") is False


def test_disable_is_per_channel():
    store = NoEmojiStore()
    store.disable("ch1")
    assert store.is_disabled("ch2") is False
