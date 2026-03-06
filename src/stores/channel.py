class ChannelStore:
    def __init__(self) -> None:
        self._channels: set[str] = set()

    def add(self, channel_id: str) -> None:
        self._channels.add(channel_id)

    def remove(self, channel_id: str) -> None:
        self._channels.discard(channel_id)

    def get_allowed_channels(self) -> set[str]:
        return set(self._channels)

    def is_allowed(self, channel_id: str) -> bool:
        if not self._channels:
            return True
        return channel_id in self._channels
