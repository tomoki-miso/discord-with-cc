from abc import ABC, abstractmethod


class AgentHandler(ABC):
    @abstractmethod
    async def ask(self, prompt: str, channel_id: str) -> str:
        """プロンプトを受け取り、応答文字列を返す"""
        ...

    @abstractmethod
    def clear_history(self, channel_id: str) -> None:
        """指定チャンネルの履歴をクリアする"""
        ...
