import pytest
from unittest.mock import AsyncMock, MagicMock
from src.schedule.runner import ScheduleRunner
from src.stores.schedule import ScheduleEntry


@pytest.fixture
def runner():
    mock_send = AsyncMock()
    store = MagicMock()
    store.list.return_value = []
    return ScheduleRunner(send_message=mock_send, store=store)


def test_add_job(runner):
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    runner.add_job(entry)
    jobs = runner._scheduler.get_jobs()
    assert len(jobs) == 1


def test_remove_job(runner):
    entry = ScheduleEntry(id="1", channel_id="ch1", cron="0 9 * * *", message="おはよう")
    runner.add_job(entry)
    runner.remove_job("1")
    jobs = runner._scheduler.get_jobs()
    assert len(jobs) == 0
