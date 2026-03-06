from src import config
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore
from src.stores.tone import ToneStore
from src.stores.calendar import CalendarStore
from src.stores.channel import ChannelStore
from src.stores.schedule import ScheduleStore
from src.discord.reaction_handler import ReactionHandler
from src.commands.router import CommandRouter
from src.commands.clear import handle_clear
from src.commands.tone import handle_tone
from src.commands.calendar import handle_calendar
from src.commands.channel import handle_channel
from src.schedule.runner import ScheduleRunner
from src.bot import create_bot


def build_agent() -> AgentHandler:
    system_prompt = config.DISCORD_BOT_PROMPT
    if config.AGENT_TYPE == "claude":
        from src.agents.claude import ClaudeAgent
        return ClaudeAgent(
            api_key=config.ANTHROPIC_API_KEY,
            model=config.CLAUDE_MODEL,
            system_prompt=system_prompt,
        )
    elif config.AGENT_TYPE == "gemini":
        from src.agents.gemini import GeminiAgent
        return GeminiAgent(
            api_key=config.GOOGLE_API_KEY,
            model=config.GEMINI_MODEL,
            system_prompt=system_prompt,
        )
    elif config.AGENT_TYPE == "codex":
        from src.agents.codex import CodexAgent
        return CodexAgent(work_dir=config.AGENT_WORK_DIR)
    else:  # qwen (default)
        from src.agents.qwen import QwenAgent
        return QwenAgent(
            api_url=config.OLLAMA_API_URL,
            model=config.OLLAMA_MODEL,
            system_prompt=system_prompt,
        )


def main() -> None:
    agent = build_agent()
    history_store = HistoryStore()
    tone_store = ToneStore()
    calendar_store = CalendarStore()
    channel_store = ChannelStore()
    schedule_store = ScheduleStore()

    # リアクションハンドラー
    reaction_agent = build_agent()
    reaction_handler = ReactionHandler(agent=reaction_agent)

    # コマンドルーター
    router = CommandRouter()
    router.register("!clear", lambda ch, u, a: handle_clear(history_store, ch, u, a))
    router.register("!tone", lambda ch, u, a: handle_tone(tone_store, ch, u, a))
    router.register("!calendar", lambda ch, u, a: handle_calendar(calendar_store, ch, u, a))
    router.register("!channel", lambda ch, u, a: handle_channel(channel_store, ch, u, a))

    async def on_mention(prompt: str, channel_id: str) -> str:
        if router.is_command(prompt):
            result = await router.dispatch(prompt, channel_id, "")
            return result or "不明なコマンドです"
        if not channel_store.is_allowed(channel_id):
            return "このチャンネルではbotは無効です"
        return await agent.ask(prompt, channel_id)

    async def send_scheduled(channel_id: str, message: str) -> None:
        response = await agent.ask(message, channel_id)
        print(f"Scheduled [{channel_id}]: {response}")

    schedule_runner = ScheduleRunner(send_message=send_scheduled, store=schedule_store)
    schedule_runner.start()

    bot = create_bot(
        on_mention=on_mention,
        on_message=reaction_handler.handle,
    )
    bot.run(config.DISCORD_TOKEN)


if __name__ == "__main__":
    main()
