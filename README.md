# discord-claude-code

Discord上でClaude / Qwen (Ollama) / Gemini / CodeX を使えるBot。チャンネルでBotにメンションすると、指定したエージェントへメッセージを転送し、応答を返します。Claude・Qwen を選択した場合はチャンネルごとに会話履歴を保持します。

> **TypeScript 実装**: https://github.com/tomoki-miso/discord-with-cc-ts

## クイックスタート

1. Discord ボットを作成し、トークンを取得する（→ [Discord ボットの作成](#discordボットの作成)）
2. リポジトリをクローンして依存パッケージをインストール
   ```bash
   pip install -r requirements.txt
   ```
3. `.env.example` を `.env.dev` にコピーし `DISCORD_TOKEN` と `AGENT_WORK_DIR` を設定
4. 起動
   ```bash
   ENV_FILE=.env.dev python -m src.main
   ```

## セットアップ

### 前提条件

- Python 3.11+
- Discord ボットトークン（[Discord Developer Portal](https://discord.com/developers/applications) で作成）
- 使用するエージェントに応じた追加設定（→ [エージェントの切り替え](#エージェントの切り替え)）

### インストール

```bash
pip install -r requirements.txt
```

### 環境変数

`.env.example` を `.env.dev` にコピーして値を設定します。

```bash
cp .env.example .env.dev
```

| 変数 | 説明 |
|---|---|
| `DISCORD_TOKEN` | Discord ボットトークン（必須） |
| `AGENT_WORK_DIR` | エージェントが操作する作業ディレクトリ（必須） |
| `AGENT_TYPE` | 使用するエージェント (`claude` / `gemini` / `qwen` / `codex`)。未設定時は `qwen` |
| `ANTHROPIC_API_KEY` | Claude 使用時: Anthropic API キー |
| `CLAUDE_MODEL` | Claude 使用時: モデル名（デフォルト: `claude-sonnet-4-6`）|
| `GOOGLE_API_KEY` | Gemini 使用時: Google API キー |
| `GEMINI_MODEL` | Gemini 使用時: モデル名（デフォルト: `gemini-2.0-flash`）|
| `OLLAMA_API_URL` | Qwen 使用時: Ollama サーバー URL（デフォルト: `http://localhost:11434`）|
| `OLLAMA_MODEL` | Qwen 使用時: モデル名（デフォルト: `qwen2.5:14b`）|
| `OLLAMA_NUM_CTX` | Qwen 使用時: コンテキスト長（デフォルト: `8192`）|
| `DISCORD_BOT_PROMPT` | Bot のシステムプロンプト（任意）|
| `DEFAULT_TONE` | デフォルトのトーン設定（任意）|
| `CHANNELS_FILE` | チャンネル設定の保存先（デフォルト: `data/channels.json`）|
| `TAVILY_API_KEY` | Web 検索機能用 Tavily API キー（任意）|

### Discord ボットの作成

[Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成し、以下を設定します。

**OAuth2 Scopes**（URL Generator で選択）:
- `bot`
- `applications.commands`

**Bot Permissions**:
- `Send Messages`
- `Read Message History`
- `View Channels`
- `Add Reactions`

**Privileged Gateway Intents**（Bot 設定ページで有効化）:
- **Server Members Intent**
- **Message Content Intent**

### エージェントの切り替え

#### Qwen / Ollama（デフォルト）

- **前提**: [Ollama](https://ollama.com) がインストールされ、ローカルサーバーが起動していること
- モデルのダウンロード: `ollama pull qwen2.5:14b`
- 会話履歴あり（チャンネルごと）

```env
AGENT_TYPE=qwen
OLLAMA_MODEL=qwen2.5:14b
# OLLAMA_API_URL=http://localhost:11434  # カスタムエンドポイントの場合のみ設定
```

#### Claude

- **前提**: `ANTHROPIC_API_KEY` が設定済みであること
- 会話履歴あり（チャンネルごと）

```env
AGENT_TYPE=claude
ANTHROPIC_API_KEY=your_api_key
```

#### Gemini

- **前提**: `GOOGLE_API_KEY` が設定済みであること
- stateless（毎リクエストで履歴なし）

```env
AGENT_TYPE=gemini
GOOGLE_API_KEY=your_api_key
```

#### CodeX

- **前提**: `codex` CLI がインストールされていること
- stateless（毎リクエストで履歴なし）

```env
AGENT_TYPE=codex
```

## 使い方

### 開発

```bash
ENV_FILE=.env.dev python -m src.main
```

### テスト

```bash
python -m pytest
```

## アーキテクチャ

```
Discord @mention
  → bot.py          … メンション検出、typing表示
  → CommandRouter   … !command の場合はコマンドハンドラーへ
  → agents/         … claude.py / qwen.py / gemini.py / codex.py
  → splitter.py     … 2000文字分割
  → Discord 送信
```

### モジュール構成

| ファイル | 役割 |
|---|---|
| `src/main.py` | エントリポイント。全ストア・コマンド・エージェント・スケジューラーを配線 |
| `src/bot.py` | discord.py クライアント。@mention 検出、typing indicator、リアクション |
| `src/config.py` | 環境変数を一括管理 |
| `src/agents/base.py` | AgentHandler プロトコル（抽象基底） |
| `src/agents/claude.py` | Anthropic SDK ラッパー。セッション管理 |
| `src/agents/qwen.py` | Ollama API ラッパー（Qwen）。セッション管理 |
| `src/agents/gemini.py` | Google Generative AI SDK ラッパー |
| `src/agents/codex.py` | CodeX CLI の非対話実行ラッパー |
| `src/commands/router.py` | CommandRouter（prefix マッチング） |
| `src/stores/` | 機能別ストア（history, tone, calendar, channel 等） |
| `src/discord/splitter.py` | split_message()（2000文字分割） |
| `src/schedule/` | スケジュール送信（parser, runner） |

## ライセンス

UNLICENSED (Private)
