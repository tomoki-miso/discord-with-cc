import re

_MD_LINK_RE = re.compile(r'\[([^\]]*)\]\(<[^>]*>\)')


def split_message(text: str, limit: int = 2000) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= limit:
        return [text]

    parts: list[str] = []
    while text:
        if len(text) <= limit:
            parts.append(text)
            break
        idx = text.rfind("\n", 0, limit)
        if idx == -1:
            idx = _safe_split_idx(text, limit)
        parts.append(text[:idx])
        text = text[idx:].lstrip("\n")
    return [p for p in parts if p]


def _safe_split_idx(text: str, limit: int) -> int:
    """Markdownリンク内での分割を避けた分割位置を返す。"""
    for m in _MD_LINK_RE.finditer(text):
        start, end = m.start(), m.end()
        if start < limit <= end:
            # limitがリンク内に入る場合、リンクの前で分割（先頭始まりは諦めてlimit）
            return start if start > 0 else limit
    return limit
