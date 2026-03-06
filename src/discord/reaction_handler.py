import time
import re
from src.agents.base import AgentHandler

REACTION_PROMPT = """以下のメッセージに対して、最も適切な絵文字を1つだけ返してください。
リアクション不要と判断した場合は「なし」と返してください。
絵文字か「なし」のみを返し、説明は不要です。

メッセージ: {message}"""

EMOJI_PATTERN = re.compile(
    r'[\U0001F300-\U0001F9FF\U00002702-\U000027B0\U0001FA00-\U0001FA9F'
    r'\U00002500-\U00002BEF\U0001F004\U0001F0CF]'
)


class ReactionHandler:
    def __init__(self, agent: AgentHandler, rate_limit_seconds: float = 3.0) -> None:
        self._agent = agent
        self._rate_limit = rate_limit_seconds
        self._last_reaction: dict[str, float] = {}

    async def handle(self, message: object) -> None:
        if getattr(getattr(message, "author", None), "bot", False):
            return

        channel_id = str(getattr(getattr(message, "channel", None), "id", ""))
        now = time.monotonic()
        if now - self._last_reaction.get(channel_id, 0) < self._rate_limit:
            return

        content = getattr(message, "content", "")
        if not content:
            return

        try:
            result = await self._agent.ask(
                REACTION_PROMPT.format(message=content[:200]),
                f"reaction_{channel_id}",
            )
            result = result.strip()
            if result == "なし" or not result:
                return

            emojis = EMOJI_PATTERN.findall(result)
            emoji = emojis[0] if emojis else result.split()[0] if result else None
            if emoji:
                await message.add_reaction(emoji)
                self._last_reaction[channel_id] = now
        except Exception:
            pass  # リアクション失敗は無視
