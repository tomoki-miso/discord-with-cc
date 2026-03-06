# Railway デプロイガイド

## 概要

Railway の Nixpacks を使ってデプロイする。HTTP サーバーではなく Discord bot（Worker プロセス）として動作する。

## デプロイに必要なファイル

| ファイル | 内容 | 役割 |
|----------|------|------|
| `Procfile` | `worker: python -m src.main` | プロセス起動コマンド |
| `requirements.txt` | 依存パッケージ一覧 | Nixpacks による pip インストール |
| `.python-version` | `3.11` | Python バージョン指定（gitignore 対象のため参考） |

> **注意**: `python src/main.py` ではなく `python -m src.main` を使う。`src/` 以下が `from src import ...` の絶対インポートを使っているため、プロジェクトルートが `sys.path` に含まれる `-m` 実行が必要。

## 手順

1. GitHub にプッシュ
2. [railway.app](https://railway.app) で新規プロジェクト → "Deploy from GitHub repo"
3. リポジトリを選択（Nixpacks が `requirements.txt` を検出して自動ビルド）
4. Variables タブで環境変数を設定（下記参照）
5. Service Type を "Worker" に設定（HTTP ポート不要）
6. ログで `Logged in as <bot名>` が出ることを確認

## 環境変数

| 変数名 | 必須 | 説明 | 例 |
|--------|------|------|----|
| `DISCORD_TOKEN` | ✅ | Discord bot トークン | `MTxxxxxx...` |
| `AGENT_TYPE` | ✅ | 使用するエージェント | `gemini` |
| `AGENT_WORK_DIR` | ✅ | 作業ディレクトリ | `/tmp` |
| `GOOGLE_API_KEY` | ✅（gemini 使用時） | Google Cloud API キー | `AIzaSy...` |
| `GEMINI_MODEL` | — | Gemini モデル名（デフォルト: `gemini-2.0-flash`） | `gemini-2.0-flash` |
| `DEFAULT_TONE` | — | デフォルト人格プロンプト（デフォルト: カニミソくん） | — |
| `ANTHROPIC_API_KEY` | ✅（claude 使用時） | Anthropic API キー | `sk-ant-...` |
| `TAVILY_API_KEY` | — | Web 検索用 Tavily API キー | `tvly-...` |

### AGENT_TYPE の選択肢

| 値 | エージェント | 必要な API キー |
|----|-------------|----------------|
| `gemini` | Google Gemini | `GOOGLE_API_KEY` |
| `claude` | Anthropic Claude | `ANTHROPIC_API_KEY` |
| `qwen` | Ollama (Qwen) | `OLLAMA_API_URL` |

## ビルドの仕組み

```
Nixpacks が requirements.txt を検出
  → pip install -r requirements.txt
  → Procfile の worker: コマンドで起動
  → python -m src.main
```

## トラブルシューティング

### `ModuleNotFoundError: No module named 'src'`

`Procfile` が `python src/main.py` になっている場合に発生。`python -m src.main` に変更する。

### `ModuleNotFoundError: No module named 'dotenv'`

`requirements.txt` が存在しない場合、Nixpacks が依存関係をインストールしない。`requirements.txt` を追加する。

### ボットがオフラインのまま

Railway の Logs タブでエラーを確認する。`DISCORD_TOKEN` や `GOOGLE_API_KEY` 等の必須環境変数が未設定の場合、起動時に `ValueError: 環境変数 XXX が設定されていません` が出る。

## 注意事項

- 状態はすべてインメモリ（再デプロイ時にリセット）
- `.env` / `.env.dev` ファイルはデプロイ環境では使用しない（Railway の Variables で管理）
