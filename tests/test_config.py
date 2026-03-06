import os
import pytest


def test_discord_token_required(monkeypatch):
    monkeypatch.setenv("ENV_FILE", "")  # .env.dev を読まない
    monkeypatch.delenv("DISCORD_TOKEN", raising=False)
    with pytest.raises(ValueError, match="DISCORD_TOKEN"):
        import importlib
        import src.config as cfg
        importlib.reload(cfg)


def test_agent_type_defaults_to_qwen(monkeypatch):
    monkeypatch.setenv("ENV_FILE", "")  # .env.dev を読まない
    monkeypatch.setenv("DISCORD_TOKEN", "test-token")
    monkeypatch.setenv("AGENT_WORK_DIR", "/tmp")
    monkeypatch.delenv("AGENT_TYPE", raising=False)
    import importlib
    import src.config as cfg
    importlib.reload(cfg)
    assert cfg.AGENT_TYPE == "qwen"


def test_all_env_vars_loaded(monkeypatch):
    monkeypatch.setenv("DISCORD_TOKEN", "tok")
    monkeypatch.setenv("AGENT_WORK_DIR", "/work")
    monkeypatch.setenv("AGENT_TYPE", "claude")
    monkeypatch.setenv("OLLAMA_API_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5")
    import importlib
    import src.config as cfg
    importlib.reload(cfg)
    assert cfg.DISCORD_TOKEN == "tok"
    assert cfg.OLLAMA_API_URL == "http://localhost:11434"
