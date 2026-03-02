# discord-claude-code

Discord上でClaude Codeを使えるBot。チャンネルでBotにメンションすると、Claude Agent SDKを通じてメッセージを処理し、応答を返します。チャンネルごとに会話履歴を保持します。

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
| `DISCORD_TOKEN` | Discordボットトークン |
| `CLAUDE_WORK_DIR` | Claude SDKの作業ディレクトリ |

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
  → bot.ts     … @メンション検出、typing表示、応答分割(2000文字制限)
  → claude.ts  … Claude Agent SDKへストリーミングクエリ、セッション管理
  → history.ts … チャンネルIDごとのインメモリセッションストア
```

### モジュール構成

| ファイル | 役割 |
|---|---|
| `src/index.ts` | エントリポイント。環境変数の検証、各モジュールの初期化 |
| `src/bot.ts` | Discord.jsクライアント。メンション応答、長文メッセージの分割送信 |
| `src/claude.ts` | Claude Agent SDKのラッパー。ストリーミング応答、セッション再開 |
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
