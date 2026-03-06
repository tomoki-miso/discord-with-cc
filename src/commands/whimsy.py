from src.stores.whimsy import WhimsyStore


async def handle_whimsy(store: WhimsyStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "on":
        store.enable(channel_id)
        return f"チャンネル {channel_id} の気まぐれ返答を有効にしました"
    elif args == "off":
        store.disable(channel_id)
        return f"チャンネル {channel_id} の気まぐれ返答を無効にしました"
    status = "有効" if store.is_enabled(channel_id) else "無効"
    return f"気まぐれ返答: {status}"
