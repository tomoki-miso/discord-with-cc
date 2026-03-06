from src.stores.channel import ChannelStore


def test_no_restriction_by_default():
    store = ChannelStore()
    assert store.get_allowed_channels() == set()
    assert store.is_allowed("ch1") is True


def test_add_channel_restriction():
    store = ChannelStore()
    store.add("ch1")
    assert store.is_allowed("ch1") is True
    assert store.is_allowed("ch2") is False


def test_remove_channel():
    store = ChannelStore()
    store.add("ch1")
    store.remove("ch1")
    assert store.is_allowed("ch2") is True


def test_get_allowed_channels():
    store = ChannelStore()
    store.add("ch1")
    store.add("ch2")
    assert store.get_allowed_channels() == {"ch1", "ch2"}
