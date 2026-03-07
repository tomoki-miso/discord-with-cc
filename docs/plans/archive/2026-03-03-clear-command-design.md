# Design: `!clear` コマンド — チャンネル別コンテキストクリア

**Date:** 2026-03-03

## 概要

Discord ボットに `!clear` コマンドを追加する。実行したチャンネルの会話コンテキスト（履歴）のみを削除する。他チャンネルには影響しない。

## 背景

- Claude ハンドラは `sessionStore`（channelId → sessionId の Map）で会話を継続する
- Ollama ハンドラは内部の `historyMap`（channelId → messages[]）で会話を継続する
- 現状、コンテキストをリセットする手段は `!tone reset`（全チャンネル一括クリア）しかなく、かつ Ollama の historyMap はクリアされないバグがある

## 設計方針

`AgentHandler` インターフェースに任意メソッド `clearHistory?(channelId)` を追加し、状態を持つハンドラ（Claude・Ollama）がそれを実装する。ステートレスなハンドラ（Codex・Gemini）は実装不要。

## 変更ファイル

### `src/history.ts`

`SessionStore` インターフェースと実装に `clearChannel` を追加。

```ts
clearChannel(channelId: string): void;
// → sessions.delete(channelId)
```

### `src/agent.ts`

`AgentHandler` に任意メソッドを追加。

```ts
clearHistory?(channelId: string): void;
```

### `src/claude.ts`

`createClaudeHandler` の返り値に `clearHistory` を実装。

```ts
clearHistory(channelId) {
  config.sessionStore.clearChannel(channelId);
}
```

### `src/ollama.ts`

`createOllamaHandler` の返り値に `clearHistory` を実装。

```ts
clearHistory(channelId) {
  historyMap.delete(channelId);
}
```

### `src/bot.ts`

`BotConfig` に `onClearCommand` を追加し、`!clear` を処理する。

```ts
onClearCommand?: (channelId: string) => string;
```

`handleMessage` 内で `!clear` を検出して呼び出す（他の `!` コマンドと同様のパターン）。

### `src/index.ts`

`createBot` の呼び出しに `onClearCommand` を追加。

```ts
onClearCommand: (channelId) => {
  handler.clearHistory?.(channelId);
  return "このチャンネルのコンテキストをクリアしました。";
}
```

## コマンド仕様

| 項目 | 内容 |
|---|---|
| コマンド | `!clear` |
| 動作 | 実行チャンネルの会話履歴を削除 |
| Claude | sessionStore から該当 channelId のセッション ID を削除 |
| Ollama | historyMap から該当 channelId のメッセージ履歴を削除 |
| Codex/Gemini | ステートレスのため何もしない（確認メッセージのみ返す） |
| 返答 | `このチャンネルのコンテキストをクリアしました。` |

## テスト方針

- `history.ts`: `clearChannel` で対象チャンネルのみ削除され、他は残ることを確認
- `bot.ts`: `!clear` が `onClearCommand(channelId)` を呼ぶことを確認
- `ollama.ts`: `clearHistory` で historyMap の当該エントリが削除されることを確認
- `claude.ts`: `clearHistory` が `sessionStore.clearChannel(channelId)` を呼ぶことを確認
