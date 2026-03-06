import json
import os


class ChannelStore:
    def __init__(self, path: str = "data/channels.json") -> None:
        self._path = path
        self._channels: set[str] = self._load()

    def _load(self) -> set[str]:
        try:
            with open(self._path) as f:
                return set(json.load(f).get("allowed", []))
        except (FileNotFoundError, json.JSONDecodeError):
            return set()

    def _save(self) -> None:
        tmp = self._path + ".tmp"
        os.makedirs(os.path.dirname(os.path.abspath(self._path)), exist_ok=True)
        with open(tmp, "w") as f:
            json.dump({"allowed": sorted(self._channels)}, f)
        os.replace(tmp, self._path)

    def add(self, channel_id: str) -> None:
        self._channels.add(channel_id)
        self._save()

    def remove(self, channel_id: str) -> None:
        self._channels.discard(channel_id)
        self._save()

    def get_allowed_channels(self) -> set[str]:
        return set(self._channels)

    def is_allowed(self, channel_id: str) -> bool:
        return channel_id in self._channels
