import json
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class ScheduleEntry:
    id: str
    channel_id: str
    cron: str
    message: str


class ScheduleStore:
    def __init__(self, path: Path | None = None) -> None:
        self._path = path or Path("data/schedules.json")
        self._entries: dict[str, ScheduleEntry] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            data = json.loads(self._path.read_text())
            self._entries = {d["id"]: ScheduleEntry(**d) for d in data}

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps([asdict(e) for e in self._entries.values()]))

    def add(self, entry: ScheduleEntry) -> None:
        self._entries[entry.id] = entry
        self._save()

    def remove(self, entry_id: str) -> None:
        self._entries.pop(entry_id, None)
        self._save()

    def list(self) -> list[ScheduleEntry]:
        return list(self._entries.values())
