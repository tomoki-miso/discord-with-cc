# discord-claude-code

Discord上でClaude Code / Ollama / CodeX / Gemini CLIを使えるBot。チャンネルでBotにメンションすると、指定したエージェントへメッセージを転送し、応答を返します。Claude・Ollamaを選択した場合はチャンネルごとに会話履歴を保持します。

## クイックスタート (Claude Agent SDK)

最短でボットを起動する手順です。

1. Discord ボットを作成し、トークンを取得する（→ [Discord ボットの作成](#discordボットの作成)）
2. [Claude Agent SDK](https://docs.anthropic.com/ja/docs/claude-code/sdk) が利用可能な環境を用意する
3. リポジトリをクローンして `npm install`
4. `.env.example` を `.env.dev` にコピーし `DISCORD_TOKEN` と `AGENT_WORK_DIR` を設定
5. `npm run dev` で起動

## セットアップ

### 前提条件

- Node.js 22+
- Discord ボットトークン（[Discord Developer Portal](https://discord.com/developers/applications) で作成）
- 使用するエージェントに応じた追加ツール（→ [エージェントの切り替え](#エージェントの切り替え)）

### インストール

```bash
npm install
```

### 環境変数

`.env.example` を `.env.dev` にコピーして値を設定します。

```bash
cp .env.example .env.dev
```

| 変数 | 説明 |
|---|---|
| `DISCORD_TOKEN` | Discord ボットトークン |
| `AGENT_TYPE` | 使用するエージェント (`claude` / `ollama` / `codex` / `gemini`)。未設定時は `claude` |
| `AGENT_WORK_DIR` | エージェントが操作する作業ディレクトリ |
| `OLLAMA_MODEL` | Ollama 使用時: モデル名（例: `llama3.2`）。`AGENT_TYPE=ollama` の場合は必須 |
| `OLLAMA_URL` | Ollama 使用時: サーバー URL（デフォルト: `http://localhost:11434`）|
| `CODEX_BIN` | (任意) `codex` CLI のパス。PATH 上にある場合は不要 |
| `GEMINI_BIN` | (任意) `gemini` CLI のパス。PATH 上にある場合は不要 |
| `CLAUDE_WORK_DIR` | (任意) 互換目的の旧名。`AGENT_WORK_DIR` が未設定の場合のみ使用 |

### Discord ボットの作成

[Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成し、以下を設定します。

**OAuth2 Scopes**（URL Generator で選択）:
- `bot`
- `applications.commands`

**Bot Permissions**:
- `Send Messages`
- `Read Message History`
- `View Channels`

**Privileged Gateway Intents**（Bot 設定ページで有効化）:
- **Server Members Intent**
- **Message Content Intent**

### エージェントの切り替え

#### Claude（デフォルト）

- **前提**: [Claude Agent SDK](https://docs.anthropic.com/ja/docs/claude-code/sdk) がインストール済みであること
- 会話履歴あり（チャンネルごと）

```env
AGENT_TYPE=claude
```

#### Ollama

- **前提**: [Ollama](https://ollama.com) がインストールされ、ローカルサーバーが起動していること
- モデルのダウンロード: `ollama pull llama3.2`
- 会話履歴あり（チャンネルごと）

```env
AGENT_TYPE=ollama
OLLAMA_MODEL=llama3.2
# OLLAMA_URL=http://localhost:11434  # カスタムエンドポイントの場合のみ設定
```

#### CodeX

- **前提**: `codex` CLI がインストールされていること
- stateless（毎リクエストで履歴なし）
- PATH に無い場合は `CODEX_BIN` でフルパス指定

```env
AGENT_TYPE=codex
```

#### Gemini

- **前提**: `gemini` CLI がインストールされていること
- stateless（毎リクエストで履歴なし）
- PATH に無い場合は `GEMINI_BIN` でフルパス指定

```env
AGENT_TYPE=gemini
```

## 使い方

### 開発

```bash
npm run dev
```

### ビルド & 本番実行

```bash
npm run build
npm start
```

### テスト

```bash
npm test
```

## アーキテクチャ

```
Discord message
  → bot.ts       … @メンション検出、typing表示、応答分割(2000文字制限)
  → claude.ts / ollama.ts / codex.ts / gemini.ts … 各エージェントへの橋渡し
  → history.ts   … チャンネルIDごとのインメモリセッションストア
```

### モジュール構成

| ファイル | 役割 |
|---|---|
| `src/index.ts` | エントリポイント。環境変数の検証、各モジュールの初期化、エージェント切り替え |
| `src/bot.ts` | Discord.js クライアント。メンション応答、長文メッセージの分割送信 |
| `src/claude.ts` | Claude Agent SDK のラッパー。ストリーミング応答、セッション再開 |
| `src/ollama.ts` | Ollama API のラッパー。ストリーミング応答、セッション再開 |
| `src/codex.ts` | CodeX CLI の非対話実行ラッパー |
| `src/gemini.ts` | Gemini CLI の非対話実行ラッパー |
| `src/history.ts` | Map-based のセッションストア |
| `src/permissions.ts` | ツールの許可/拒否リストと MCP サーバー設定 |

## 権限モデル

`src/permissions.ts` で Claude SDK が使用できるツールの許可/拒否リストを定義しています。セキュリティ上、以下の操作は明示的に禁止されています:

- `.env` ファイルへのアクセス
- `git push`
- `rm -rf`
- `curl` / `wget`

この設定は `.claude/settings.json` と同期する必要があり、テスト（`claude-settings.test.ts`）で整合性が検証されます。

## MCP サーバー

以下の外部サービスが MCP サーバーとして統合されています:

| サーバー | 種類 | 用途 |
|---|---|---|
| Slack | HTTP | Slack 連携 |
| Context7 | stdio | ライブラリドキュメント参照 |
| Google Calendar | HTTP | Google Calendar 連携 |
| Apple MCP | stdio | Apple サービス連携（連絡先・メール・Calendar 等）|

## ライセンス

UNLICENSED (Private)
