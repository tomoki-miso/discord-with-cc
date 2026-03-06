from src.stores.emoji import NoEmojiStore


async def handle_emoji(store: NoEmojiStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "off":
        store.disable(channel_id)
        return "このチャンネルでは絵文字を使いません"
    elif args == "on":
        store.enable(channel_id)
        return "このチャンネルでは絵文字を使います"
    status = "OFF" if store.is_disabled(channel_id) else "ON"
    return f"絵文字: {status}（`!emoji on/off` で切り替え）"
