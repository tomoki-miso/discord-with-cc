from src.stores.reaction import NoReactionStore


async def handle_reaction(store: NoReactionStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "off":
        store.disable(channel_id)
        return "このチャンネルではリアクションしません"
    elif args == "on":
        store.enable(channel_id)
        return "このチャンネルでリアクションを再開します"
    status = "OFF" if store.is_disabled(channel_id) else "ON"
    return f"リアクション: {status}（`!reaction on/off` で切り替え）"
