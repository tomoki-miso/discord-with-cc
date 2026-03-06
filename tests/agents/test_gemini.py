import pytest
from unittest.mock import MagicMock, patch
from src.agents.gemini import GeminiAgent


@pytest.fixture
def agent():
    return GeminiAgent(api_key="test-key", model="gemini-2.0-flash", system_prompt="テスト")


async def test_ask_returns_response(agent):
    mock_response = MagicMock()
    mock_response.text = "Gemini応答"
    with patch.object(agent._model_client, "generate_content", return_value=mock_response):
        result = await agent.ask("hello", "ch1")
    assert result == "Gemini応答"
