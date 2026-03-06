from typing import Callable, Awaitable

CommandHandlerFn = Callable[[str, str, str], Awaitable[str | None]]


class CommandRouter:
    def __init__(self) -> None:
        self._handlers: dict[str, CommandHandlerFn] = {}

    def register(self, prefix: str, handler: CommandHandlerFn) -> None:
        self._handlers[prefix] = handler

    def is_command(self, text: str) -> bool:
        return any(text.startswith(p) for p in self._handlers)

    async def dispatch(
        self, text: str, channel_id: str, user_id: str
    ) -> str | None:
        for prefix, handler in self._handlers.items():
            if text.startswith(prefix):
                args = text[len(prefix):].strip()
                return await handler(channel_id, user_id, args)
        return None
