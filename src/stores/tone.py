class ToneStore:
    def __init__(self) -> None:
        self._tones: dict[str, str] = {}

    def set(self, key: str, tone: str) -> None:
        self._tones[key] = tone

    def get(self, key: str) -> str:
        return self._tones.get(key, "")

    def clear(self, key: str) -> None:
        self._tones.pop(key, None)

    def get_system_prompt(self) -> str:
        parts = [v for v in self._tones.values() if v]
        return "\n".join(parts)
