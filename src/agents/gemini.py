import asyncio
from google import genai
from google.genai import types
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore
from src.discord.url_shortener import shorten_url


_MAX_URL_LEN = 500


class GeminiAgent(AgentHandler):
    def __init__(self, api_key: str, model: str, system_prompt: str) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=[types.Tool(google_search=types.GoogleSearch())],
        )
        self._store = HistoryStore()

    async def ask(
        self,
        prompt: str,
        channel_id: str,
        images: list[tuple[bytes, str]] | None = None,
    ) -> str:
        history: list[types.Content] = self._store.get(channel_id)

        parts: list[types.Part] = []
        if images:
            parts.extend(
                types.Part(inline_data=types.Blob(mime_type=mime_type, data=data))
                for data, mime_type in images
            )
        parts.append(types.Part(text=prompt))

        def _call() -> str:
            chat = self._client.chats.create(
                model=self._model,
                config=self._config,
                history=history,
            )
            response = chat.send_message(parts)
            try:
                text = response.text or ""
            except ValueError:
                # Gemini の安全フィルターでブロックされた場合
                return "（コンテンツフィルターにより応答できませんでした）"

            # 検索グラウンディングの引用元を追記
            gm = (
                response.candidates[0].grounding_metadata
                if response.candidates else None
            )
            if gm:
                chunks = gm.grounding_chunks or []
                seen: set[str] = set()
                sources: list[str] = []
                for chunk in chunks:
                    if chunk.web and chunk.web.uri and chunk.web.uri not in seen:
                        uri = chunk.web.uri
                        seen.add(uri)
                        title = chunk.web.title or uri
                        if len(uri) <= _MAX_URL_LEN:
                            sources.append(f"- [{title}](<{uri}>)")
                        else:
                            short_url = shorten_url(uri)
                            if short_url:
                                sources.append(f"- [{title}](<{short_url}>)")
                            else:
                                sources.append(f"- {title}")

                if sources:
                    text += "\n\n**参考:**\n" + "\n".join(sources)
                elif gm.web_search_queries:
                    # AI Developer API ではURLが取得できないため検索クエリを表示
                    queries = "、".join(f"`{q}`" for q in gm.web_search_queries)
                    text += f"\n\n🔍 **検索ワード:** {queries}"

            return text

        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _call)

        self._store.set(
            channel_id,
            history + [
                types.Content(role="user", parts=[types.Part(text=prompt)]),
                types.Content(role="model", parts=[types.Part(text=text)]),
            ],
        )
        return text

    def clear_history(self, channel_id: str) -> None:
        self._store.clear(channel_id)

    def set_history(self, channel_id: str, messages: list[dict[str, str]]) -> None:
        converted = [
            types.Content(
                role="model" if msg["role"] == "assistant" else "user",
                parts=[types.Part(text=msg["content"])],
            )
            for msg in messages
        ]
        self._store.set(channel_id, converted)

    async def score_context(self, message: str) -> int:
        prompt = (
            "以下のメッセージが AI アシスタント (Bot) への問いかけ・質問・依頼である"
            "可能性を 0 から 10 の整数で評価してください。数字のみ返してください。\n"
            f"メッセージ: {message}"
        )

        def _call() -> int:
            response = self._client.models.generate_content(
                model=self._model,
                contents=prompt,
            )
            try:
                return max(0, min(10, int(response.text.strip())))
            except (ValueError, AttributeError):
                return 0

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _call)
