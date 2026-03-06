import asyncio
import google.generativeai as genai
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore


class GeminiAgent(AgentHandler):
    def __init__(self, api_key: str, model: str, system_prompt: str) -> None:
        genai.configure(api_key=api_key)
        self._model_client = genai.GenerativeModel(
            model_name=model,
            system_instruction=system_prompt,
        )
        self._store = HistoryStore()

    async def ask(self, prompt: str, channel_id: str) -> str:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: self._model_client.generate_content(prompt)
        )
        return response.text

    def clear_history(self, channel_id: str) -> None:
        self._store.clear(channel_id)
