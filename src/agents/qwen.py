import asyncio
import re
from typing import Any
from qwen_agent.agents import Assistant
from src.agents.base import AgentHandler


class QwenAgent(AgentHandler):
    def __init__(
        self,
        api_url: str,
        model: str,
        system_prompt: str,
        tools: list[str] | None = None,
    ) -> None:
        self._system_prompt = system_prompt
        self._history: dict[str, list[dict[str, Any]]] = {}
        llm_config = {
            "model": model,
            "model_server": api_url + "/v1",
            "api_key": "ollama",
        }
        self._assistant = Assistant(
            llm=llm_config,
            system_message=system_prompt,
            function_list=tools or ["web_search", "web_extractor"],
        )

    async def ask(self, prompt: str, channel_id: str, images: list[tuple[bytes, str]] | None = None) -> str:
        history = self._history.get(channel_id, [])
        messages = history + [{"role": "user", "content": prompt}]

        loop = asyncio.get_event_loop()
        response_text = await loop.run_in_executor(
            None, self._run_sync, messages
        )

        self._history[channel_id] = messages + [
            {"role": "assistant", "content": response_text}
        ]
        return response_text

    def _run_sync(self, messages: list[dict[str, Any]]) -> str:
        result = ""
        for responses in self._assistant.run(messages):
            if responses:
                last = responses[-1]
                if isinstance(last.get("content"), list):
                    for item in last["content"]:
                        if isinstance(item, dict) and item.get("text"):
                            result = item["text"]
                elif isinstance(last.get("content"), str):
                    result = last["content"]
        return result or "（応答なし）"

    def clear_history(self, channel_id: str) -> None:
        self._history.pop(channel_id, None)

    def set_history(self, channel_id: str, messages: list[dict[str, str]]) -> None:
        self._history[channel_id] = list(messages)

    async def score_context(self, message: str) -> int:
        prompt = (
            "以下のメッセージが AI アシスタント (Bot) への問いかけ・質問・依頼である"
            "可能性を 0 から 10 の整数で評価してください。数字のみ返してください。\n"
            f"メッセージ: {message}"
        )
        messages = [{"role": "user", "content": prompt}]
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._run_sync, messages)
        try:
            m = re.search(r"\d+", result)
            return max(0, min(10, int(m.group()))) if m else 0
        except (ValueError, AttributeError):
            return 0
