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
            idx = limit  # 強制分割
        parts.append(text[:idx])
        text = text[idx:].lstrip("\n")
    return [p for p in parts if p]
