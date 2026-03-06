# Whimsy Mode Design

**Date:** 2026-03-07

## Overview

メンションなしでも bot が気まぐれに返答するモード。チャンネルごとに on/off で切り替え可能。有効時は 20% の確率で非メンションメッセージにも返答する。

## Requirements

- チャンネルごとに `!whimsy on/off` で切り替え
- 確率は 20%（定数）
- 会話履歴はメインと共有（同じ channel_id で agent.ask() を呼ぶ）
- bot メッセージには反応しない

## Architecture

```
新規ファイル:
  src/stores/whimsy.py        # WhimsyStore: チャンネルごとの on/off 管理
  src/commands/whimsy.py      # handle_whimsy(): !whimsy コマンド処理

変更ファイル:
  src/bot.py                  # on_random_message コールバック追加、確率判定ロジック
  src/main.py                 # WhimsyStore 初期化、コマンド登録、on_random_message 実装
```

## Data Flow

```
Discord message (non-mention)
  → bot.py: on_random_message(message) コールバック呼び出し
  → main.py: WhimsyStore.is_enabled(channel_id) チェック
  → random() < 0.20 なら agent.ask(content, channel_id)
  → 返答を channel.send()
```

## Commands

```
!whimsy on   → このチャンネルで気まぐれ返答を有効化
!whimsy off  → 無効化
!whimsy      → 現在の状態を表示
```

## Constants

- `WHIMSY_PROBABILITY = 0.20`（bot.py または config.py で定義）

## Testing

- `WhimsyStore`: on/off/status の各ケース
- `handle_whimsy`: on/off/status コマンド
- `bot.py`: 確率判定のモック（random をパッチ）
