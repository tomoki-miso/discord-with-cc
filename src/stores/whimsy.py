class WhimsyStore:
    def __init__(self) -> None:
        self._enabled: set[str] = set()

    def enable(self, channel_id: str) -> None:
        self._enabled.add(channel_id)

    def disable(self, channel_id: str) -> None:
        self._enabled.discard(channel_id)

    def is_enabled(self, channel_id: str) -> bool:
        return channel_id in self._enabled
