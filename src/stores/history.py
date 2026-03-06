from typing import Any


class HistoryStore:
    def __init__(self) -> None:
        self._history: dict[str, list[dict[str, Any]]] = {}
        self._generation: dict[str, int] = {}

    def get(self, channel_id: str) -> list[dict[str, Any]]:
        return list(self._history.get(channel_id, []))

    def append(self, channel_id: str, message: dict[str, Any]) -> None:
        if channel_id not in self._history:
            self._history[channel_id] = []
        self._history[channel_id].append(message)

    def set(self, channel_id: str, messages: list[dict[str, Any]]) -> None:
        self._history[channel_id] = list(messages)

    def clear(self, channel_id: str) -> None:
        self._history.pop(channel_id, None)
        self._generation[channel_id] = self._generation.get(channel_id, 0) + 1

    def generation(self, channel_id: str) -> int:
        return self._generation.get(channel_id, 0)
