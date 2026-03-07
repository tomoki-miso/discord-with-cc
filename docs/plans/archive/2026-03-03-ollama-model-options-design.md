# Ollama モデルオプション設定 + ストリーミング対応 設計

## 概要

Ollamaのモデルパラメータ（temperature、num_ctx など）を環境変数で制御できるようにし、ストリーミングAPIを有効化してレスポンス速度を改善する。

## 環境変数（新規追加）

| 変数名 | 説明 | デフォルト |
|--------|------|----------|
| `OLLAMA_NUM_CTX` | コンテキストウィンドウサイズ | Ollama デフォルト |
| `OLLAMA_TEMPERATURE` | 創造性（0.0〜1.0） | Ollama デフォルト |
| `OLLAMA_TOP_P` | Top-p サンプリング | Ollama デフォルト |
| `OLLAMA_NUM_PREDICT` | 最大生成トークン数 | Ollama デフォルト |

設定しない変数はリクエストに含めず、Ollama側のデフォルトを使用する。

## 型定義の変更（`src/ollama.ts`）

`OllamaHandlerConfig` に `options?: OllamaModelOptions` を追加する。

```ts
type OllamaModelOptions = {
  num_ctx?: number;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
};

export type OllamaHandlerConfig = {
  apiUrl: string;
  model: string;
  toneStore: ToneStore;
  toolManager?: OllamaToolManager;
  options?: OllamaModelOptions; // 追加
};
```

## ストリーミング対応

- `stream: false` → `stream: true` に変更
- Ollama のストリーミングレスポンスは NDJSON（改行区切りJSON）形式で返る
- 各チャンクをバッファリングして最終テキストを組み立てる
- ツール呼び出しループ（MAX_TOOL_ITERATIONS）は既存のまま維持
- ツール呼び出しがある場合はツール実行後に再度ストリーミングリクエストを送る

## `src/index.ts` の変更

環境変数をパースして `OllamaModelOptions` を生成し `createOllamaHandler` に渡す。

```ts
function parseOllamaOptions(): OllamaModelOptions {
  const options: OllamaModelOptions = {};
  if (process.env.OLLAMA_NUM_CTX) options.num_ctx = parseInt(process.env.OLLAMA_NUM_CTX, 10);
  if (process.env.OLLAMA_TEMPERATURE) options.temperature = parseFloat(process.env.OLLAMA_TEMPERATURE);
  if (process.env.OLLAMA_TOP_P) options.top_p = parseFloat(process.env.OLLAMA_TOP_P);
  if (process.env.OLLAMA_NUM_PREDICT) options.num_predict = parseInt(process.env.OLLAMA_NUM_PREDICT, 10);
  return options;
}
```

## テスト方針

- `ollama.test.ts` に `options` フィールドがリクエストボディに含まれることを確認するテストを追加
- ストリーミングレスポンスのモックテストを追加
- 環境変数が未設定の場合は `options` フィールドを送信しないことを確認

## 影響範囲

- `src/ollama.ts` — 型定義・ストリーミング対応・options送信
- `src/index.ts` — 環境変数パース・options渡し
- `.env.example` — 新規環境変数のコメント追加
- `src/__tests__/ollama.test.ts` — テスト追加
