from src.stores.calendar import CalendarStore


async def handle_calendar(calendar_store: CalendarStore, channel_id: str, user_id: str, args: str) -> str:
    if args == "on":
        calendar_store.enable(channel_id)
        return "カレンダーモードをONにしました"
    elif args == "off":
        calendar_store.disable(channel_id)
        return "カレンダーモードをOFFにしました"
    status = "ON" if calendar_store.is_enabled(channel_id) else "OFF"
    return f"カレンダーモード: {status}"
