import re
import asyncio
from typing import Callable, Awaitable
import discord
from src.discord.splitter import split_message

OnMentionFn = Callable[[str, str, "list[tuple[bytes, str]] | None"], Awaitable[str]]
OnMessageFn = Callable[[object], Awaitable[None]]
OnReadyFn = Callable[[], Awaitable[None]]
OnRandomMessageFn = Callable[[object], Awaitable[None]]


class DiscordBot:
    def __init__(
        self,
        on_mention: OnMentionFn,
        on_message: OnMessageFn,
        on_ready: OnReadyFn | None = None,
        on_random_message: OnRandomMessageFn | None = None,
    ) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        self._client = discord.Client(intents=intents)
        self._on_mention = on_mention
        self._on_message_reaction = on_message
        self._on_ready_cb = on_ready
        self._on_random_message = on_random_message
        self._setup_events()

    def _setup_events(self) -> None:
        @self._client.event
        async def on_ready() -> None:
            if self._on_ready_cb:
                await self._on_ready_cb()

        @self._client.event
        async def on_message(message: discord.Message) -> None:
            await self._on_message_handler(message)

    async def _on_message_handler(self, message: discord.Message) -> None:
        if message.author.bot:
            return

        async def _run_safe(coro: object, label: str) -> None:
            try:
                await coro  # type: ignore[misc]
            except Exception as e:
                print(f"[{label}] error: {e}")

        # リアクション処理（全メッセージ対象、非同期）
        asyncio.create_task(_run_safe(self._on_message_reaction(message), "reaction"))

        # メンション処理
        if self._client.user not in message.mentions:
            if self._on_random_message:
                asyncio.create_task(_run_safe(self._on_random_message(message), "whimsy"))
            return

        prompt = re.sub(r"<@!?\d+>", "", message.content).strip()
        if not prompt:
            return

        images: list[tuple[bytes, str]] = []
        for attachment in message.attachments:
            if attachment.content_type and attachment.content_type.startswith("image/"):
                images.append((await attachment.read(), attachment.content_type))

        async with message.channel.typing():
            try:
                response = await self._on_mention(prompt, str(message.channel.id), images or None)
            except Exception as e:
                response = f"エラーが発生しました: {e}"

        for part in split_message(response):
            await message.channel.send(part)

    def run(self, token: str) -> None:
        self._client.run(token)


def create_bot(
    on_mention: OnMentionFn,
    on_message: OnMessageFn,
    on_ready: OnReadyFn | None = None,
    on_random_message: OnRandomMessageFn | None = None,
) -> DiscordBot:
    return DiscordBot(
        on_mention=on_mention,
        on_message=on_message,
        on_ready=on_ready,
        on_random_message=on_random_message,
    )
