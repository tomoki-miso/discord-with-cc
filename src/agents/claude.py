import asyncio
import base64
import anthropic
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore


class ClaudeAgent(AgentHandler):
    def __init__(
        self,
        api_key: str,
        model: str,
        system_prompt: str,
    ) -> None:
        self._model = model
        self._system_prompt = system_prompt
        self._client = anthropic.Anthropic(api_key=api_key)
        self._store = HistoryStore()

    async def ask(self, prompt: str, channel_id: str, images: list[tuple[bytes, str]] | None = None) -> str:
        history = self._store.get(channel_id)

        if images:
            content: list = [
                {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": base64.b64encode(data).decode()}}
                for data, mime_type in images
            ]
            content.append({"type": "text", "text": prompt})
        else:
            content = prompt  # type: ignore[assignment]

        messages = history + [{"role": "user", "content": content}]

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                system=self._system_prompt,
                messages=messages,
            ),
        )

        text = response.content[0].text
        self._store.set(
            channel_id,
            messages + [{"role": "assistant", "content": text}],
        )
        return text

    def clear_history(self, channel_id: str) -> None:
        self._store.clear(channel_id)

    def set_history(self, channel_id: str, messages: list[dict[str, str]]) -> None:
        self._store.set(channel_id, messages)

    async def score_context(self, message: str) -> int:
        prompt = (
            "以下のメッセージが AI アシスタント (Bot) への問いかけ・質問・依頼である"
            "可能性を 0 から 10 の整数で評価してください。数字のみ返してください。\n"
            "0=Bot への言及なし  5=曖昧  10=明確な質問・依頼\n"
            f"メッセージ: {message}"
        )
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._client.messages.create(
                model=self._model,
                max_tokens=5,
                messages=[{"role": "user", "content": prompt}],
            ),
        )
        try:
            return max(0, min(10, int(response.content[0].text.strip())))
        except (ValueError, IndexError):
            return 0
