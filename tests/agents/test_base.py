import pytest
from src.agents.base import AgentHandler


def test_agent_handler_is_abstract():
    with pytest.raises(TypeError):
        AgentHandler()  # type: ignore


class ConcreteAgent(AgentHandler):
    async def ask(self, prompt: str, channel_id: str) -> str:
        return "response"

    def clear_history(self, channel_id: str) -> None:
        pass

    def set_history(self, channel_id: str, messages: list[dict[str, str]]) -> None:
        pass

    async def score_context(self, message: str) -> int:
        return 0


async def test_concrete_agent_works():
    agent = ConcreteAgent()
    result = await agent.ask("hello", "ch1")
    assert result == "response"
