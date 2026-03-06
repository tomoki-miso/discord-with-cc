from src.stores.channel import ChannelStore


async def handle_channel(channel_store: ChannelStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "add":
        channel_store.add(channel_id)
        return f"チャンネル {channel_id} を許可リストに追加しました"
    elif args == "remove":
        channel_store.remove(channel_id)
        return f"チャンネル {channel_id} を許可リストから削除しました"
    channels = channel_store.get_allowed_channels()
    return f"許可チャンネル: {', '.join(channels) or '（制限なし）'}"
