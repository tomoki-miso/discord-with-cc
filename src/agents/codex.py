import asyncio
from src.agents.base import AgentHandler


class CodexAgent(AgentHandler):
    def __init__(self, work_dir: str, codex_bin: str = "codex") -> None:
        self._work_dir = work_dir
        self._codex_bin = codex_bin

    async def ask(self, prompt: str, channel_id: str, images: list[tuple[bytes, str]] | None = None) -> str:
        proc = await asyncio.create_subprocess_exec(
            self._codex_bin, "exec", "--full-auto", prompt,
            cwd=self._work_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            return f"エラー: {stderr.decode()}"
        return stdout.decode().strip()

    def clear_history(self, channel_id: str) -> None:
        pass  # stateless

    def set_history(self, channel_id: str, messages: list[dict[str, str]]) -> None:
        pass  # stateless
