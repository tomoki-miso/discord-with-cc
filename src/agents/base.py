from abc import ABC, abstractmethod


class AgentHandler(ABC):
    @abstractmethod
    async def ask(self, prompt: str, channel_id: str, images: list[tuple[bytes, str]] | None = None) -> str:
        """プロンプトを受け取り、応答文字列を返す。images は (bytes, mime_type) のリスト"""
        ...

    @abstractmethod
    def clear_history(self, channel_id: str) -> None:
        """指定チャンネルの履歴をクリアする"""
        ...

    @abstractmethod
    def set_history(self, channel_id: str, messages: list[dict[str, str]]) -> None:
        """指定チャンネルの履歴を外部から上書きする"""
        ...

    @abstractmethod
    async def score_context(self, message: str) -> int:
        """メッセージが Bot への問いかけである可能性を 0〜10 の整数で返す。"""
        ...
