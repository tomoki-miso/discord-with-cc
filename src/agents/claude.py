import asyncio
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

    async def ask(self, prompt: str, channel_id: str) -> str:
        history = self._store.get(channel_id)
        messages = history + [{"role": "user", "content": prompt}]

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
