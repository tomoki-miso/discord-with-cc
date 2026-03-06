from src.stores.tone import ToneStore


async def handle_tone(tone_store: ToneStore, channel_id: str, user_id: str, args: str) -> str:
    if not args:
        current = tone_store.get(channel_id) or "（未設定）"
        return f"現在のトーン: {current}"
    tone_store.set(channel_id, args)
    return f"トーンを設定しました: {args}"
