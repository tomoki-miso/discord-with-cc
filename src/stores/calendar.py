from enum import StrEnum


class CalendarMode(StrEnum):
    ON = "on"
    OFF = "off"


class CalendarStore:
    def __init__(self) -> None:
        self._modes: dict[str, CalendarMode] = {}

    def enable(self, channel_id: str) -> None:
        self._modes[channel_id] = CalendarMode.ON

    def disable(self, channel_id: str) -> None:
        self._modes[channel_id] = CalendarMode.OFF

    def is_enabled(self, channel_id: str) -> bool:
        return self._modes.get(channel_id) == CalendarMode.ON
