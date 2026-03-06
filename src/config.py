import os
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise ValueError(f"環境変数 {key} が設定されていません")
    return val


DISCORD_TOKEN: str = _require("DISCORD_TOKEN")
AGENT_WORK_DIR: str = _require("AGENT_WORK_DIR")
AGENT_TYPE: str = os.getenv("AGENT_TYPE", "qwen")

OLLAMA_API_URL: str = os.getenv("OLLAMA_API_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:14b")
OLLAMA_NUM_CTX: int = int(os.getenv("OLLAMA_NUM_CTX", "8192"))

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")

DISCORD_BOT_PROMPT: str = os.getenv(
    "DISCORD_BOT_PROMPT",
    "あなたはDiscordのアシスタントです。簡潔に日本語で回答してください。"
)
