class NoEmojiStore:
    def __init__(self) -> None:
        self._channels: set[str] = set()

    def disable(self, channel_id: str) -> None:
        self._channels.add(channel_id)

    def enable(self, channel_id: str) -> None:
        self._channels.discard(channel_id)

    def is_disabled(self, channel_id: str) -> bool:
        return channel_id in self._channels
