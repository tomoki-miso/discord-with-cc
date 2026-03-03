# Ollama web_fetch HTML→Markdown変換 設計書

## 概要

Ollama の `web_fetch` ビルトインツールが生のHTMLを返すため、Ollamaがページ内容を理解しにくい問題を修正する。
`turndown` ライブラリを使ってHTML→Markdown変換を行い、LLMが扱いやすい形式で返す。

## 現状の問題

`ollama-tools.ts` の `web_fetch` 実装：

```typescript
case "web_fetch": {
  const response = await fetch(args.url as string);
  return await response.text(); // 生HTMLが返る
}
```

生のHTMLはタグ・スクリプト・スタイルを含むため、Ollamaが内容を正確に把握しにくい。

## 設計

### 依存追加

- `turndown` — HTML→Markdown変換ライブラリ
- `@types/turndown` — TypeScript型定義（devDependencies）

### 変更ファイル

**`src/ollama-tools.ts`**

1. `TurndownService` インポート追加
2. `createOllamaToolManager` クロージャー内で `TurndownService` インスタンスを1回生成
3. `web_fetch` ケースでHTMLをMarkdownに変換して返す

**`src/__tests__/ollama-tools.test.ts`**

- `web_fetch` テストの期待値を、Markdown変換後の内容に更新

### 実装イメージ

```typescript
import TurndownService from "turndown";

// createOllamaToolManager 内
const td = new TurndownService();

// executeTool の web_fetch ケース
case "web_fetch": {
  const response = await fetch(args.url as string);
  const html = await response.text();
  return td.turndown(html);
}
```

### 影響範囲

- `ollama-tools.ts` の `web_fetch` ケースのみ変更
- ツールのインターフェース（名前・パラメーター）は変更なし
- 既存の `BUILTIN_TOOLS` 定義は変更なし

## 代替案

| 案 | 内容 | 理由で不採用 |
|---|---|---|
| B: readability + turndown | 主要コンテンツ抽出 + Markdown変換 | 依存3個追加・重い |
| C: タグ除去 | 正規表現でHTMLタグを除去 | 精度低い |
