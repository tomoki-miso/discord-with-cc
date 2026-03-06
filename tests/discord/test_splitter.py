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


def test_no_split_within_markdown_link():
    # Given: limitがMarkdownリンクの途中に当たるテキスト
    # prefix=7文字、link=33文字（[サイト名](<url>)）、total=40文字
    prefix = "前置きテキスト"  # 7文字
    url = "https://example.com/abc"  # 23文字
    text = f"{prefix}[サイト名](<{url}>)"
    limit = 38  # 7 < 38 < 40 → limitがリンクの途中に入る

    # When: 分割する
    parts = split_message(text, limit=limit)

    # Then: リンク全体が破損しないこと（同じパート内に [title](<url>) が存在）
    link_text = f"[サイト名](<{url}>)"
    assert any(link_text in p for p in parts)
