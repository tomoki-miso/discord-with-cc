from src.discord.splitter import split_message


def test_short_message_not_split():
    parts = split_message("hello", limit=2000)
    assert parts == ["hello"]


def test_long_message_split_at_newline():
    text = "line1\nline2\nline3"
    parts = split_message(text, limit=10)
    assert len(parts) > 1
    assert all(len(p) <= 10 for p in parts)


def test_split_preserves_content():
    text = "a\nb\nc\nd\ne"
    parts = split_message(text, limit=5)
    assert "".join(parts).replace("\n", "") == "abcde"


def test_empty_string_returns_empty_list():
    assert split_message("") == []


def test_whitespace_only_returns_empty_list():
    assert split_message("   \n  ") == []


def test_very_long_word_is_hard_split():
    text = "a" * 2500
    parts = split_message(text, limit=2000)
    assert all(len(p) <= 2000 for p in parts)
