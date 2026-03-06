import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from src.agents.codex import CodexAgent


@pytest.fixture
def agent():
    return CodexAgent(work_dir="/tmp", codex_bin="codex")


async def test_ask_calls_subprocess(agent):
    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (b"Codex\xe5\xbf\x9c\xe7\xad\x94\n", b"")
    mock_proc.returncode = 0
    with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        result = await agent.ask("hello", "ch1")
    assert "Codex応答" in result


def test_clear_history_is_noop(agent):
    agent.clear_history("ch1")
