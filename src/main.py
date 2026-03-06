from src import config
from src.agents.base import AgentHandler
from src.stores.history import HistoryStore
from src.stores.tone import ToneStore
from src.stores.calendar import CalendarStore
from src.stores.channel import ChannelStore
from src.stores.schedule import ScheduleStore
from src.stores.whimsy import WhimsyStore
from src.stores.emoji import NoEmojiStore
from src.stores.reaction import NoReactionStore
from src.discord.reaction_handler import ReactionHandler
from src.discord.splitter import split_message
from src.commands.router import CommandRouter
from src.commands.clear import handle_clear
from src.commands.tone import handle_tone
from src.commands.calendar import handle_calendar
from src.commands.channel import handle_channel
from src.commands.whimsy import handle_whimsy
from src.commands.emoji import handle_emoji
from src.commands.reaction import handle_reaction
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
    import random
    WHIMSY_PROBABILITY = 0.20

    agent = build_agent()
    history_store = HistoryStore()
    tone_store = ToneStore(default=config.DEFAULT_TONE)
    calendar_store = CalendarStore()
    channel_store = ChannelStore(path=config.CHANNELS_FILE)
    schedule_store = ScheduleStore()
    whimsy_store = WhimsyStore()
    no_emoji_store = NoEmojiStore()
    no_reaction_store = NoReactionStore()

    # リアクションハンドラー
    reaction_agent = build_agent()
    reaction_handler = ReactionHandler(agent=reaction_agent, store=no_reaction_store)

    # コマンドルーター
    router = CommandRouter()
    router.register("!clear", lambda ch, u, a: handle_clear(history_store, ch, u, a))
    router.register("!tone", lambda ch, u, a: handle_tone(tone_store, ch, u, a))
    router.register("!calendar", lambda ch, u, a: handle_calendar(calendar_store, ch, u, a))
    router.register("!channel", lambda ch, u, a: handle_channel(channel_store, ch, u, a))
    router.register("!whimsy", lambda ch, u, a: handle_whimsy(whimsy_store, ch, u, a))
    router.register("!emoji", lambda ch, u, a: handle_emoji(no_emoji_store, ch, u, a))
    router.register("!reaction", lambda ch, u, a: handle_reaction(no_reaction_store, ch, u, a))

    async def on_mention(prompt: str, channel_id: str, images: list[tuple[bytes, str]] | None = None) -> str:
        if router.is_command(prompt):
            result = await router.dispatch(prompt, channel_id, "")
            return result or "不明なコマンドです"
        if not channel_store.is_allowed(channel_id):
            return "このチャンネルではbotは無効です"
        instructions: list[str] = []
        tone = tone_store.get_effective(channel_id)
        if tone:
            instructions.append(tone)
        if no_emoji_store.is_disabled(channel_id):
            instructions.append("絵文字は使わないでください。")
        full_prompt = "\n".join(instructions) + "\n\n" + prompt if instructions else prompt
        return await agent.ask(full_prompt, channel_id, images)

    async def send_scheduled(channel_id: str, message: str) -> None:
        response = await agent.ask(message, channel_id)
        print(f"Scheduled [{channel_id}]: {response}")

    schedule_runner = ScheduleRunner(send_message=send_scheduled, store=schedule_store)

    async def on_random_message(message: object) -> None:
        channel_id = str(getattr(getattr(message, "channel", None), "id", ""))
        if not whimsy_store.is_enabled(channel_id):
            return
        if random.random() >= WHIMSY_PROBABILITY:
            return
        content = getattr(message, "content", "").strip()
        if not content:
            return
        response = await agent.ask(content, channel_id)
        channel = getattr(message, "channel", None)
        if channel:
            for part in split_message(response):
                await channel.send(part)

    async def on_ready() -> None:
        schedule_runner.start()

    bot = create_bot(
        on_mention=on_mention,
        on_message=reaction_handler.handle,
        on_ready=on_ready,
        on_random_message=on_random_message,
    )
    bot.run(config.DISCORD_TOKEN)


if __name__ == "__main__":
    main()
