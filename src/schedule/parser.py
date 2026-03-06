import re

WEEKDAY_MAP = {
    "月": "mon", "火": "tue", "水": "wed", "木": "thu",
    "金": "fri", "土": "sat", "日": "sun",
}


def parse_schedule_expression(expr: str) -> dict | None:
    """
    自然言語のスケジュール表現をAPSchedulerのcronパラメータ辞書に変換する
    Returns None if parsing fails
    """
    result: dict = {}

    # 曜日の抽出
    for jp, en in WEEKDAY_MAP.items():
        if jp + "曜" in expr:
            result["day_of_week"] = en
            break

    # 時刻の抽出
    time_match = re.search(r"(\d{1,2})時(?:(\d{2})分)?", expr)
    if time_match:
        result["hour"] = int(time_match.group(1))
        result["minute"] = int(time_match.group(2) or 0)
    else:
        return None

    # 分おきの抽出
    minute_match = re.search(r"(\d+)分おき", expr)
    if minute_match:
        result["minute"] = f"*/{minute_match.group(1)}"
        result["hour"] = "*"

    return result if result else None
