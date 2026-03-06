from typing import Callable, Awaitable
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from src.stores.schedule import ScheduleStore, ScheduleEntry

SendMessageFn = Callable[[str, str], Awaitable[None]]


class ScheduleRunner:
    def __init__(self, send_message: SendMessageFn, store: ScheduleStore) -> None:
        self._send = send_message
        self._store = store
        self._scheduler = AsyncIOScheduler()

    def start(self) -> None:
        for entry in self._store.list():
            self._add_job_internal(entry)
        self._scheduler.start()

    def add_job(self, entry: ScheduleEntry) -> None:
        self._store.add(entry)
        self._add_job_internal(entry)

    def _add_job_internal(self, entry: ScheduleEntry) -> None:
        self._scheduler.add_job(
            self._send,
            CronTrigger.from_crontab(entry.cron),
            args=[entry.channel_id, entry.message],
            id=entry.id,
            replace_existing=True,
        )

    def remove_job(self, entry_id: str) -> None:
        self._store.remove(entry_id)
        try:
            self._scheduler.remove_job(entry_id)
        except Exception:
            pass
