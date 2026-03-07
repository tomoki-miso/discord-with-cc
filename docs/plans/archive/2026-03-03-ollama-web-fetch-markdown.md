# Ollama web_fetch HTML→Markdown変換 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `ollama-tools.ts` の `web_fetch` ツールが生のHTMLではなくMarkdownを返すようにする

**Architecture:** `turndown` パッケージをインポートし、fetch結果のHTMLをMarkdownに変換して返す。TurndownServiceインスタンスはクロージャー内で1回だけ生成する。

**Tech Stack:** TypeScript, turndown, vitest

---

### Task 1: turndown パッケージ追加

**Files:**
- Modify: `package.json`

**Step 1: 依存をインストール**

```bash
npm install turndown
npm install --save-dev @types/turndown
```

**Step 2: インストール確認**

```bash
npm ls turndown
```
Expected: `turndown@x.x.x` が表示される

**Step 3: ビルドが通ることを確認**

```bash
npm run build
```
Expected: エラーなし

**Step 4: コミット**

```bash
git add package.json package-lock.json
git commit -m "chore: add turndown for HTML→Markdown conversion"
```

---

### Task 2: テストを先に更新（TDD）

**Files:**
- Modify: `src/__tests__/ollama-tools.test.ts:316-332`

**Step 1: turndown モックを追加**

テストファイルの先頭（他のモックと一緒に）に追加：

```typescript
// ---- turndown mock ----
vi.mock("turndown", () => ({
  default: vi.fn().mockImplementation(() => ({
    turndown: vi.fn().mockReturnValue("# Markdown content"),
  })),
}));
```

**Step 2: web_fetch テストの期待値を更新**

`describe("executeTool - web_fetch", ...)` ブロック内のテストを以下に差し替え：

```typescript
describe("executeTool - web_fetch", () => {
  it("fetches URL and returns Markdown (converted from HTML)", async () => {
    // Given: mock global fetch
    const mockFetch = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue("<html><body><h1>Title</h1></body></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const manager = createOllamaToolManager(makeConfig());

    // When
    const result = await manager.executeTool("web_fetch", { url: "https://example.com" });

    // Then: turndown に変換されているはず
    expect(result).toBe("# Markdown content");

    vi.unstubAllGlobals();
  });
});
```

**Step 3: テストが失敗することを確認（まだ実装してないので）**

```bash
npx vitest run src/__tests__/ollama-tools.test.ts
```
Expected: `web_fetch` テストが FAIL（`<html><body>...` が返ってきて `# Markdown content` と一致しない）

**Step 4: コミット（失敗するテスト込みで）**

```bash
git add src/__tests__/ollama-tools.test.ts
git commit -m "test: update web_fetch test to expect Markdown output"
```

---

### Task 3: ollama-tools.ts に turndown を組み込む

**Files:**
- Modify: `src/ollama-tools.ts`

**Step 1: インポートを追加**

ファイル先頭のimport群に追加：

```typescript
import TurndownService from "turndown";
```

**Step 2: TurndownService インスタンスを生成**

`createOllamaToolManager` 関数内の先頭（`const mcpClients = new Map...` の直前）に追加：

```typescript
const td = new TurndownService();
```

**Step 3: web_fetch ケースを更新**

`executeTool` switch文の `case "web_fetch":` ブロックを差し替え：

```typescript
case "web_fetch": {
  const response = await fetch(args.url as string);
  const html = await response.text();
  return td.turndown(html);
}
```

**Step 4: テストが通ることを確認**

```bash
npx vitest run src/__tests__/ollama-tools.test.ts
```
Expected: 全テスト PASS

**Step 5: 全テスト実行**

```bash
npm test
```
Expected: 全テスト PASS

**Step 6: コミット**

```bash
git add src/ollama-tools.ts
git commit -m "feat: convert web_fetch HTML output to Markdown using turndown"
```
