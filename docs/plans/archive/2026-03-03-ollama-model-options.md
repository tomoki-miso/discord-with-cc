# Ollama モデルオプション設定 + ストリーミング対応 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 環境変数でOllamaモデルのパラメータ（temperature、num_ctx など）を制御できるようにし、ストリーミングAPIでレスポンス速度を改善する。

**Architecture:** `OllamaHandlerConfig` に `options?: OllamaModelOptions` を追加し、`stream: true` でNDJSONストリーミングレスポンスをバッファリングして集約する。`index.ts` で環境変数をパースして渡す。

**Tech Stack:** TypeScript, Vitest, Ollama REST API (`/api/chat`)

---

### Task 1: `OllamaModelOptions` 型定義 + リクエストボディへの `options` 送信

**Files:**
- Modify: `src/ollama.ts`
- Test: `src/__tests__/ollama.test.ts`

**Step 1: 失敗するテストを書く**

`src/__tests__/ollama.test.ts` の `describe("createOllamaHandler"` ブロック内、既存テストの後に追加：

```typescript
it("includes options in the request body when options are provided", async () => {
  // Given: a handler with model options configured
  const toneStore = createMockToneStore();
  const handler = createOllamaHandler({
    apiUrl: "http://localhost:11434",
    model: "qwen2.5:7b",
    toneStore,
    options: { temperature: 0.5, num_ctx: 2048, top_p: 0.9, num_predict: 512 },
  });
  mockFetch.mockResolvedValueOnce(createSuccessResponse("response"));

  // When
  await handler.ask("Hello", "ch1");

  // Then: options are passed in the request body
  const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
  expect(body.options).toEqual({ temperature: 0.5, num_ctx: 2048, top_p: 0.9, num_predict: 512 });
});

it("omits options from the request body when no options are provided", async () => {
  // Given: a handler with no options
  const toneStore = createMockToneStore();
  const handler = createOllamaHandler({
    apiUrl: "http://localhost:11434",
    model: "llama3.2",
    toneStore,
  });
  mockFetch.mockResolvedValueOnce(createSuccessResponse("response"));

  // When
  await handler.ask("Hello", "ch1");

  // Then: options key is absent from the request body
  const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
  expect(body.options).toBeUndefined();
});
```

**Step 2: テストを実行して失敗を確認**

```bash
npx vitest run src/__tests__/ollama.test.ts
```

期待する結果: `OllamaHandlerConfig` に `options` プロパティがないため型エラーまたはテスト失敗

**Step 3: `src/ollama.ts` を修正して `options` を追加**

ファイル先頭付近の型定義に追加：

```typescript
export type OllamaModelOptions = {
  num_ctx?: number;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
};
```

`OllamaHandlerConfig` に `options` フィールドを追加：

```typescript
export type OllamaHandlerConfig = {
  apiUrl: string;
  model: string;
  toneStore: ToneStore;
  toolManager?: OllamaToolManager;
  options?: OllamaModelOptions; // 追加
};
```

`ask` 関数内の `body` 構築部分を修正（`stream: false` はこのタスクではそのまま）：

```typescript
const body: Record<string, unknown> = {
  model: config.model,
  messages,
  stream: false,
};
if (tools.length > 0) {
  body.tools = tools;
}
if (config.options && Object.keys(config.options).length > 0) {
  body.options = config.options;
}
```

**Step 4: テストを実行して成功を確認**

```bash
npx vitest run src/__tests__/ollama.test.ts
```

期待する結果: 全テスト PASS

**Step 5: コミット**

```bash
git add src/ollama.ts src/__tests__/ollama.test.ts
git commit -m "feat: add OllamaModelOptions type and options field to request body"
```

---

### Task 2: ストリーミング対応（`stream: true` + NDJSONバッファリング）

**Files:**
- Modify: `src/ollama.ts`
- Test: `src/__tests__/ollama.test.ts`

**背景知識:** Ollama の `stream: true` レスポンスは改行区切りのJSON（NDJSON）で返る。各行は `{ message: { role, content, tool_calls? }, done: boolean }` の形式。ツール呼び出しがある場合、`tool_calls` は最初の非空チャンクに含まれる。テキストは各チャンクの `content` を結合する。

**Step 1: テストヘルパー関数を追加**

`src/__tests__/ollama.test.ts` の既存ヘルパー関数の後に追加（`beforeEach` の前）：

```typescript
function createStreamingSuccessResponse(content: string) {
  const chunks = [
    JSON.stringify({ message: { role: "assistant", content: content.slice(0, Math.ceil(content.length / 2)) }, done: false }),
    JSON.stringify({ message: { role: "assistant", content: content.slice(Math.ceil(content.length / 2)) }, done: false }),
    JSON.stringify({ message: { role: "assistant", content: "" }, done: true }),
  ].join("\n");
  const encoder = new TextEncoder();
  const encoded = encoder.encode(chunks);
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
    text: vi.fn(),
  };
}

function createStreamingToolCallResponse(toolName: string, toolArgs: Record<string, unknown> = {}) {
  const chunks = [
    JSON.stringify({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: toolName, arguments: toolArgs } }],
      },
      done: false,
    }),
    JSON.stringify({ message: { role: "assistant", content: "" }, done: true }),
  ].join("\n");
  const encoder = new TextEncoder();
  const encoded = encoder.encode(chunks);
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
    text: vi.fn(),
  };
}
```

**Step 2: ストリーミング用の失敗テストを追加**

既存テストの後に追加：

```typescript
describe("streaming responses", () => {
  it("aggregates streamed text chunks into a single response", async () => {
    // Given: a streaming response with two content chunks
    const toneStore = createMockToneStore();
    const handler = createOllamaHandler({
      apiUrl: "http://localhost:11434",
      model: "qwen2.5:7b",
      toneStore,
    });
    mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("Hello World"));

    // When
    const result = await handler.ask("Hi", "ch1");

    // Then: full text is returned
    expect(result).toBe("Hello World");
  });

  it("sends stream: true in the request body", async () => {
    // Given
    const toneStore = createMockToneStore();
    const handler = createOllamaHandler({
      apiUrl: "http://localhost:11434",
      model: "qwen2.5:7b",
      toneStore,
    });
    mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("ok"));

    // When
    await handler.ask("test", "ch1");

    // Then: stream is true
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.stream).toBe(true);
  });

  it("handles tool calls in streamed response", async () => {
    // Given
    const toolManager = createMockToolManager([SAMPLE_TOOL]);
    const toneStore = createMockToneStore();
    const handler = createOllamaHandler({
      apiUrl: "http://localhost:11434",
      model: "qwen2.5:7b",
      toneStore,
      toolManager,
    });
    mockFetch
      .mockResolvedValueOnce(createStreamingToolCallResponse("read_file", { path: "foo.ts" }))
      .mockResolvedValueOnce(createStreamingSuccessResponse("file content"));

    // When
    const result = await handler.ask("Read foo.ts", "ch1");

    // Then
    expect(toolManager.executeTool).toHaveBeenCalledWith("read_file", { path: "foo.ts" });
    expect(result).toBe("file content");
  });
});
```

**Step 3: テストを実行して失敗を確認**

```bash
npx vitest run src/__tests__/ollama.test.ts
```

期待する結果: ストリーミング関連テストが失敗（現在は `stream: false` のまま）

**Step 4: `src/ollama.ts` のストリーミング処理を実装**

ファイルの先頭あたりに NDJSON パース用ヘルパーを追加：

```typescript
async function readStreamingResponse(response: Response): Promise<{
  content: string;
  tool_calls?: OllamaToolCall[];
}> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let tool_calls: OllamaToolCall[] | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const chunk = JSON.parse(trimmed) as OllamaApiResponse;
      if (chunk.message.content) {
        content += chunk.message.content;
      }
      const msg = chunk.message as Extract<OllamaMessage, { role: "assistant" }>;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        tool_calls = msg.tool_calls;
      }
    }
  }

  return { content, tool_calls };
}
```

`ask` 関数の `body` 内で `stream: false` を `stream: true` に変更し、レスポンス処理を差し替え：

```typescript
// 変更前
const body: Record<string, unknown> = {
  model: config.model,
  messages,
  stream: false,
};
// ...
const data = (await response.json()) as OllamaApiResponse;
const assistantMessage = data.message as Extract<OllamaMessage, { role: "assistant" }>;
```

```typescript
// 変更後
const body: Record<string, unknown> = {
  model: config.model,
  messages,
  stream: true,
};
// ...
const { content, tool_calls } = await readStreamingResponse(response);
const assistantMessage: Extract<OllamaMessage, { role: "assistant" }> = {
  role: "assistant",
  content,
  ...(tool_calls ? { tool_calls } : {}),
};
```

ループ終了後の `historyMap.set` の前に `assistantMessage` を使うよう、既存コードを確認して調整。

**Step 5: テストを実行して全テスト通過を確認**

```bash
npx vitest run src/__tests__/ollama.test.ts
```

注意: 既存の `createSuccessResponse` を使うテスト（`response.json()` を返す）はストリーミング実装と互換性がなくなる。既存テストのモックを `createStreamingSuccessResponse` に移行する必要がある。

既存テストを一括更新：`createSuccessResponse` の使用箇所を `createStreamingSuccessResponse` に、`createToolCallResponse` を `createStreamingToolCallResponse` に置換。

**Step 6: 全テストスイートを実行**

```bash
npm test
```

期待する結果: 全テスト PASS

**Step 7: コミット**

```bash
git add src/ollama.ts src/__tests__/ollama.test.ts
git commit -m "feat: enable streaming for Ollama responses (stream: true)"
```

---

### Task 3: `index.ts` で環境変数をパースして `options` を渡す

**Files:**
- Modify: `src/index.ts`
- Test: `src/__tests__/index.test.ts`

**Step 1: 失敗するテストを書く**

`src/__tests__/index.test.ts` を読んで既存テストの構造を確認してから、`parseOllamaOptions` のテストを追加。`parseOllamaOptions` を `index.ts` からエクスポートする前提で書く：

```typescript
// src/__tests__/index.test.ts に追加
import { parseOllamaOptions } from "../index.js";

describe("parseOllamaOptions", () => {
  it("returns empty object when no OLLAMA_ env vars are set", () => {
    const result = parseOllamaOptions({});
    expect(result).toEqual({});
  });

  it("parses OLLAMA_TEMPERATURE as float", () => {
    const result = parseOllamaOptions({ OLLAMA_TEMPERATURE: "0.7" });
    expect(result.temperature).toBe(0.7);
  });

  it("parses OLLAMA_NUM_CTX as integer", () => {
    const result = parseOllamaOptions({ OLLAMA_NUM_CTX: "4096" });
    expect(result.num_ctx).toBe(4096);
  });

  it("parses OLLAMA_TOP_P as float", () => {
    const result = parseOllamaOptions({ OLLAMA_TOP_P: "0.95" });
    expect(result.top_p).toBe(0.95);
  });

  it("parses OLLAMA_NUM_PREDICT as integer", () => {
    const result = parseOllamaOptions({ OLLAMA_NUM_PREDICT: "512" });
    expect(result.num_predict).toBe(512);
  });

  it("parses all options together", () => {
    const result = parseOllamaOptions({
      OLLAMA_TEMPERATURE: "0.5",
      OLLAMA_NUM_CTX: "2048",
      OLLAMA_TOP_P: "0.9",
      OLLAMA_NUM_PREDICT: "256",
    });
    expect(result).toEqual({ temperature: 0.5, num_ctx: 2048, top_p: 0.9, num_predict: 256 });
  });
});
```

**Step 2: テストを実行して失敗を確認**

```bash
npx vitest run src/__tests__/index.test.ts
```

期待する結果: `parseOllamaOptions` がエクスポートされていないため失敗

**Step 3: `src/index.ts` に `parseOllamaOptions` を実装**

`createHandlerForAgent` 関数の前に追加し、エクスポートする：

```typescript
export function parseOllamaOptions(env: Record<string, string | undefined>): OllamaModelOptions {
  const options: OllamaModelOptions = {};
  if (env.OLLAMA_TEMPERATURE !== undefined) {
    options.temperature = parseFloat(env.OLLAMA_TEMPERATURE);
  }
  if (env.OLLAMA_NUM_CTX !== undefined) {
    options.num_ctx = parseInt(env.OLLAMA_NUM_CTX, 10);
  }
  if (env.OLLAMA_TOP_P !== undefined) {
    options.top_p = parseFloat(env.OLLAMA_TOP_P);
  }
  if (env.OLLAMA_NUM_PREDICT !== undefined) {
    options.num_predict = parseInt(env.OLLAMA_NUM_PREDICT, 10);
  }
  return options;
}
```

`import` に `OllamaModelOptions` を追加（`ollama.ts` からインポート）：

```typescript
import { createOllamaHandler, type OllamaModelOptions } from "./ollama.js";
```

`createHandlerForAgent` の `ollama` ケースを修正：

```typescript
case "ollama": {
  const apiUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL!;
  const toolManager = createOllamaToolManager({ mcpServers: MCP_SERVERS, cwd: deps.cwd });
  const options = parseOllamaOptions(process.env);
  return createOllamaHandler({ apiUrl, model, toneStore: deps.toneStore, toolManager, options });
}
```

**Step 4: テストを実行して成功を確認**

```bash
npx vitest run src/__tests__/index.test.ts
```

**Step 5: 全テストスイートを実行**

```bash
npm test
```

期待する結果: 全テスト PASS

**Step 6: コミット**

```bash
git add src/index.ts src/__tests__/index.test.ts
git commit -m "feat: parse OLLAMA_* env vars and pass model options to handler"
```

---

### Task 4: `.env.example` を更新して新規環境変数を文書化

**Files:**
- Modify: `.env.example`

**Step 1: `.env.example` を読む**

既存の内容を確認し、Ollama関連のセクションを探す。

**Step 2: 新規環境変数のコメントを追加**

既存の `OLLAMA_MODEL` や `OLLAMA_URL` の近くに以下を追加：

```bash
# Ollama モデルオプション（省略時はOllamaのデフォルト値を使用）
# OLLAMA_TEMPERATURE=0.7       # 創造性（0.0〜1.0）。低いほど決定論的
# OLLAMA_NUM_CTX=4096          # コンテキストウィンドウサイズ（トークン数）
# OLLAMA_TOP_P=0.9             # Top-p サンプリング
# OLLAMA_NUM_PREDICT=512       # 最大生成トークン数（-1で無制限）
```

**Step 3: テストを実行して他に影響がないことを確認**

```bash
npm test
```

**Step 4: コミット**

```bash
git add .env.example
git commit -m "docs: document OLLAMA_* model option env vars in .env.example"
```

---

## 完了チェックリスト

- [ ] `OllamaModelOptions` 型が `src/ollama.ts` にエクスポートされている
- [ ] `OllamaHandlerConfig.options` フィールドが追加されている
- [ ] `options` が未指定の場合、リクエストボディに `options` キーが含まれない
- [ ] `stream: true` でリクエストを送信している
- [ ] NDJSONレスポンスをバッファリングしてテキストを集約している
- [ ] ストリーミング中のツール呼び出しが正しく処理される
- [ ] `parseOllamaOptions` が環境変数をパースして返す
- [ ] `npm test` が全テスト PASS
