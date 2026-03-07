# チャンネル許可リスト永続化 設計

## 背景

`ChannelStore` は現在インメモリ管理のみで、Bot再起動時に設定が失われる。
デプロイ環境では `!channel add` で設定しても再起動のたびにリセットされ、
空リスト = 全チャンネル許可という挙動になってしまう問題がある。

## 要件

- `!channel add/remove` の変更を `data/channels.json` に即時保存する
- Bot 再起動後もファイルから復元して許可リストを維持する
- 空リスト（ファイルなし含む）= 全チャンネルブロック（セキュアデフォルト）
- ファイルパスはリポジトリルートの `data/channels.json` に固定

## アーキテクチャ

### ChannelStore の変更

```python
class ChannelStore:
    def __init__(self, path: str = "data/channels.json") -> None:
        self._path = path
        self._channels: set[str] = self._load()

    def _load(self) -> set[str]:
        try:
            with open(self._path) as f:
                return set(json.load(f).get("allowed", []))
        except (FileNotFoundError, json.JSONDecodeError):
            return set()

    def _save(self) -> None:
        # アトミック書き込み（一時ファイル → rename）
        tmp = self._path + ".tmp"
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        with open(tmp, "w") as f:
            json.dump({"allowed": sorted(self._channels)}, f)
        os.replace(tmp, self._path)

    def add(self, channel_id: str) -> None:
        self._channels.add(channel_id)
        self._save()

    def remove(self, channel_id: str) -> None:
        self._channels.discard(channel_id)
        self._save()

    def is_allowed(self, channel_id: str) -> bool:
        return channel_id in self._channels  # 空 = False（全ブロック）
```

### 挙動の変化

| 状態 | 変更前 | 変更後 |
|------|--------|--------|
| 空リスト | 全チャンネル許可 | 全チャンネルブロック |
| 再起動後 | リセット | ファイルから復元 |

### ファイルフォーマット

```json
{"allowed": ["123456789012345678", "987654321098765432"]}
```

sorted() で常に同じ順序を保つ。

## 変更ファイル

| ファイル | 変更内容 |
|--------|--------|
| `src/stores/channel.py` | ファイルI/O追加、`is_allowed` 空=ブロック変更 |
| `src/config.py` | `CHANNELS_FILE = "data/channels.json"` 追加 |
| `src/main.py` | `ChannelStore(path=config.CHANNELS_FILE)` に変更 |
| `tests/stores/test_channel.py` | ファイル読み書き・永続化・空=ブロックのテスト追加 |
| `tests/commands/test_channel.py` | 空=ブロック挙動変更に合わせて修正 |
| `data/.gitkeep` | `data/` ディレクトリを git 管理下に置く |
| `.gitignore` | `data/channels.json` を追加 |

## 安全性

- 書き込みはアトミック（`os.replace`）: 中断されてもファイルが壊れない
- `data/` ディレクトリは自動作成（`os.makedirs`）
- JSONパースエラー時は空セット（全ブロック）にフォールバック
