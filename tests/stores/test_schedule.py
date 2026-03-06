import json
import tempfile
from pathlib import Path
from src.stores.schedule import ScheduleStore, ScheduleEntry


def test_add_and_list_schedule():
    store = ScheduleStore()
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    store.add(entry)
    assert len(store.list()) == 1
    assert store.list()[0].message == "おはよう"


def test_remove_schedule():
    store = ScheduleStore()
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    store.add(entry)
    store.remove("1")
    assert store.list() == []


def test_persist_and_load(tmp_path):
    path = tmp_path / "schedules.json"
    store = ScheduleStore(path=path)
    store.add(ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="test"))
    store2 = ScheduleStore(path=path)
    assert len(store2.list()) == 1
    assert store2.list()[0].id == "1"
