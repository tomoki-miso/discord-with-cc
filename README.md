# discord-claude-code

Discord上でClaude Code / CodeX / Gemini CLIを使えるBot。チャンネルでBotにメンションすると、指定したエージェントへメッセージを転送し、応答を返します。Claudeを選択した場合はチャンネルごとに会話履歴を保持します。

## セットアップ

### 前提条件

- Node.js 22+
- Discordボットトークン ([Discord Developer Portal](https://discord.com/developers/applications) で作成)
- Claude Agent SDK が利用可能な環境

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
| 変数 | 説明 |
|---|---|
| `DISCORD_TOKEN` | Discordボットトークン |
| `AGENT_TYPE` | 使用するエージェント (`claude` / `codex` / `gemini`)。未設定時は `claude` |
| `AGENT_WORK_DIR` | エージェントが操作する作業ディレクトリ |
| `CODEX_BIN` | (任意) `codex` CLIのパス。PATH上にある場合は不要 |
| `GEMINI_BIN` | (任意) `gemini` CLIのパス。PATH上にある場合は不要 |
| `CLAUDE_WORK_DIR` | (任意) 互換目的の旧名。`AGENT_WORK_DIR` が未設定の場合のみ使用 |

### エージェントの切り替え

- `AGENT_TYPE=claude` … これまで通り Claude Agent SDK を利用します（会話履歴あり）。
- `AGENT_TYPE=codex` … OpenAI CodeX CLI を `codex exec` の非対話モードで実行します（毎リクエスト stateless）。
- `AGENT_TYPE=gemini` … Gemini CLI の非対話モードを使います（毎リクエスト stateless）。

CodeX / Gemini 用の CLI が PATH に無い場合は `CODEX_BIN` / `GEMINI_BIN` でフルパスを指定してください。

### Discordボットの権限

ボット作成時に以下のIntentsを有効にしてください:

- **Server Members Intent**
- **Message Content Intent**

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
  → claude.ts / codex.ts / gemini.ts … 各エージェントへの橋渡し
  → history.ts   … チャンネルIDごとのインメモリセッションストア
```

### モジュール構成

| ファイル | 役割 |
|---|---|
| `src/index.ts` | エントリポイント。環境変数の検証、各モジュールの初期化、エージェント切り替え |
| `src/bot.ts` | Discord.jsクライアント。メンション応答、長文メッセージの分割送信 |
| `src/claude.ts` | Claude Agent SDKのラッパー。ストリーミング応答、セッション再開 |
| `src/codex.ts` | CodeX CLI の非対話実行ラッパー |
| `src/gemini.ts` | Gemini CLI の非対話実行ラッパー |
| `src/history.ts` | Map-basedのセッションストア |
| `src/permissions.ts` | ツールの許可/拒否リストとMCPサーバー設定 |

## 権限モデル

`src/permissions.ts` でClaude SDKが使用できるツールの許可/拒否リストを定義しています。セキュリティ上、以下の操作は明示的に禁止されています:

- `.env` ファイルへのアクセス
- `git push`
- `rm -rf`
- `curl` / `wget`

この設定は `.claude/settings.json` と同期する必要があり、テスト（`claude-settings.test.ts`）で整合性が検証されます。

## MCP サーバー

以下の外部サービスがMCPサーバーとして統合されています:

| サーバー | 種類 | 用途 |
|---|---|---|
| Slack | HTTP | Slack連携 |
| Context7 | stdio | ライブラリドキュメント参照 |

## ライセンス

UNLICENSED (Private)
