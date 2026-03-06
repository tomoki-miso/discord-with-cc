from src.stores.history import HistoryStore


async def handle_clear(history_store: HistoryStore, channel_id: str, user_id: str, args: str) -> str:
    history_store.clear(channel_id)
    return "履歴をクリアしました"
