import json
import pytest
from src.stores.channel import ChannelStore


@pytest.fixture
def store(tmp_path):
    return ChannelStore(path=str(tmp_path / "channels.json"))


def test_empty_blocks_all_channels(store):
    # 空リスト = 全ブロック（セキュアデフォルト）
    assert store.is_allowed("ch1") is False


def test_add_channel_allows_it(store):
    store.add("ch1")
    assert store.is_allowed("ch1") is True
    assert store.is_allowed("ch2") is False


def test_remove_channel_blocks_it(store):
    store.add("ch1")
    store.add("ch2")
    store.remove("ch1")
    assert store.is_allowed("ch1") is False
    assert store.is_allowed("ch2") is True


def test_get_allowed_channels(store):
    store.add("ch1")
    store.add("ch2")
    assert store.get_allowed_channels() == {"ch1", "ch2"}


def test_persists_to_file(store, tmp_path):
    # add するとファイルに書き込まれる
    store.add("ch1")
    path = tmp_path / "channels.json"
    data = json.loads(path.read_text())
    assert "ch1" in data["allowed"]


def test_loads_from_existing_file(tmp_path):
    # 既存ファイルがあれば起動時に読み込む
    path = tmp_path / "channels.json"
    path.write_text(json.dumps({"allowed": ["ch1", "ch2"]}))
    store = ChannelStore(path=str(path))
    assert store.is_allowed("ch1") is True
    assert store.is_allowed("ch2") is True


def test_missing_file_starts_empty(tmp_path):
    # ファイルなし = 空セット（全ブロック）
    store = ChannelStore(path=str(tmp_path / "nonexistent.json"))
    assert store.is_allowed("ch1") is False


def test_broken_json_starts_empty(tmp_path):
    # JSONパースエラー = 空セット（全ブロック）にフォールバック
    path = tmp_path / "channels.json"
    path.write_text("not valid json")
    store = ChannelStore(path=str(path))
    assert store.is_allowed("ch1") is False


def test_remove_persists_to_file(store, tmp_path):
    store.add("ch1")
    store.add("ch2")
    store.remove("ch1")
    path = tmp_path / "channels.json"
    data = json.loads(path.read_text())
    assert "ch1" not in data["allowed"]
    assert "ch2" in data["allowed"]
