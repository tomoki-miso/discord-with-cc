from src.stores.tone import ToneStore


def test_default_tone_is_empty():
    store = ToneStore()
    assert store.get_system_prompt() == ""


def test_set_and_get_tone():
    store = ToneStore()
    store.set("ch1", "丁寧語で話してください")
    assert store.get("ch1") == "丁寧語で話してください"


def test_get_system_prompt_includes_tone():
    store = ToneStore()
    store.set("global", "カジュアルに話してください")
    prompt = store.get_system_prompt()
    assert "カジュアルに話してください" in prompt


def test_clear_tone():
    store = ToneStore()
    store.set("ch1", "丁寧語")
    store.clear("ch1")
    assert store.get("ch1") == ""


def test_get_effective_returns_channel_tone_if_set():
    store = ToneStore(default="デフォルト人格")
    store.set("ch1", "丁寧語で話してください")
    assert store.get_effective("ch1") == "丁寧語で話してください"


def test_get_effective_falls_back_to_default():
    store = ToneStore(default="デフォルト人格")
    assert store.get_effective("ch_unknown") == "デフォルト人格"


def test_get_effective_empty_when_no_default():
    store = ToneStore()
    assert store.get_effective("ch1") == ""
