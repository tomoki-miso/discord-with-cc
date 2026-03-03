# `!clear` コマンド実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `!clear` コマンドを追加し、実行したチャンネルの会話コンテキストのみを削除する。

**Architecture:** `AgentHandler` インターフェースに任意メソッド `clearHistory?(channelId)` を追加し、Claude/Ollama ハンドラがそれを実装する。`bot.ts` に `onClearCommand` コールバックを追加し、`index.ts` でハンドラと接続する。

**Tech Stack:** TypeScript, Vitest, discord.js, Claude Agent SDK

---

### Task 1: `SessionStore` に `clearChannel` を追加

**Files:**
- Modify: `src/history.ts`
- Modify: `src/claude.ts`（`createMockSessionStore` の更新）
- Test: `src/__tests__/history.test.ts`

**Step 1: テストを書く（失敗するはず）**

`src/__tests__/history.test.ts` の末尾に追加：

```ts
it("should remove only the specified channel when clearChannel is called", () => {
  // Given: a store with two channels
  const store = createSessionStore();
  store.set("channel-1", "session-aaa");
  store.set("channel-2", "session-bbb");

  // When: clearing only channel-1
  store.clearChannel("channel-1");

  // Then: channel-1 is removed, channel-2 remains
  expect(store.get("channel-1")).toBeUndefined();
  expect(store.get("channel-2")).toBe("session-bbb");
});
```

**Step 2: 失敗を確認**

```bash
npx vitest run src/__tests__/history.test.ts
```

Expected: FAIL（`clearChannel is not a function`）

**Step 3: 実装**

`src/history.ts` を以下に変更：

```ts
export type SessionStore = {
  get(channelId: string): string | undefined;
  set(channelId: string, sessionId: string): void;
  clear(): void;
  clearChannel(channelId: string): void;
};

export function createSessionStore(): SessionStore {
  const sessions = new Map<string, string>();

  return {
    get(channelId: string): string | undefined {
      return sessions.get(channelId);
    },
    set(channelId: string, sessionId: string): void {
      sessions.set(channelId, sessionId);
    },
    clear(): void {
      sessions.clear();
    },
    clearChannel(channelId: string): void {
      sessions.delete(channelId);
    },
  };
}
```

**Step 4: テストが通ることを確認**

```bash
npx vitest run src/__tests__/history.test.ts
```

Expected: PASS（全テスト）

**Step 5: コミット**

```bash
git add src/history.ts src/__tests__/history.test.ts
git commit -m "feat: add clearChannel to SessionStore"
```

---

### Task 2: `AgentHandler` に `clearHistory?` を追加

**Files:**
- Modify: `src/agent.ts`

型定義のみの変更なのでテストは不要。

**Step 1: 実装**

`src/agent.ts` の `AgentHandler` 型を変更：

```ts
export type AgentHandler = {
  ask(prompt: string, channelId: string): Promise<string>;
  clearHistory?(channelId: string): void;
};
```

**Step 2: ビルドエラーがないことを確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add src/agent.ts
git commit -m "feat: add optional clearHistory to AgentHandler interface"
```

---

### Task 3: Claude ハンドラに `clearHistory` を実装

**Files:**
- Modify: `src/claude.ts`
- Test: `src/__tests__/claude.test.ts`

**Step 1: `createMockSessionStore` に `clearChannel` を追加**

`src/__tests__/claude.test.ts` の `createMockSessionStore` 関数を更新：

```ts
function createMockSessionStore() {
  const map = new Map<string, string>();
  return {
    get: vi.fn((channelId: string) => map.get(channelId)),
    set: vi.fn((channelId: string, sessionId: string) => {
      map.set(channelId, sessionId);
    }),
    clear: vi.fn(() => map.clear()),
    clearChannel: vi.fn((channelId: string) => map.delete(channelId)),
  };
}
```

**Step 2: テストを書く（失敗するはず）**

`src/__tests__/claude.test.ts` に `describe` ブロックを追加：

```ts
describe("clearHistory", () => {
  it("should call clearChannel on sessionStore for the given channelId", () => {
    // Given: a claude handler with a session store
    const sessionStore = createMockSessionStore();
    const toneStore = createMockToneStore();
    const handler = createClaudeHandler({ cwd: "/test", sessionStore, toneStore });

    // When: clearHistory is called for a channel
    handler.clearHistory?.("channel-42");

    // Then: sessionStore.clearChannel is called with the channel ID
    expect(sessionStore.clearChannel).toHaveBeenCalledWith("channel-42");
  });
});
```

**Step 3: 失敗を確認**

```bash
npx vitest run src/__tests__/claude.test.ts
```

Expected: FAIL

**Step 4: 実装**

`src/claude.ts` の `createClaudeHandler` を変更：

```ts
export function createClaudeHandler(config: ClaudeHandlerConfig): ClaudeHandler {
  return {
    async ask(prompt: string, channelId: string): Promise<string> {
      try {
        return await executeQuery(config, prompt, channelId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    },
    clearHistory(channelId: string): void {
      config.sessionStore.clearChannel(channelId);
    },
  };
}
```

**Step 5: テストが通ることを確認**

```bash
npx vitest run src/__tests__/claude.test.ts
```

Expected: PASS（全テスト）

**Step 6: コミット**

```bash
git add src/claude.ts src/__tests__/claude.test.ts
git commit -m "feat: implement clearHistory in Claude handler"
```

---

### Task 4: Ollama ハンドラに `clearHistory` を実装

**Files:**
- Modify: `src/ollama.ts`
- Test: `src/__tests__/ollama.test.ts`

**Step 1: テストを書く（失敗するはず）**

`src/__tests__/ollama.test.ts` の適切な `describe` ブロック内（または末尾）に追加：

```ts
describe("clearHistory", () => {
  it("should remove conversation history for the given channel", async () => {
    // Given: a handler with history from a previous conversation
    const toneStore = createMockToneStore();
    mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("first response"));
    const handler = createOllamaHandler({
      apiUrl: "http://localhost:11434",
      model: "test-model",
      toneStore,
    });
    await handler.ask("hello", "channel-99");

    // When: clearing history for the channel
    handler.clearHistory?.("channel-99");

    // Then: next request sends no history (only the new user message)
    mockFetch.mockResolvedValueOnce(createStreamingSuccessResponse("fresh response"));
    await handler.ask("hi again", "channel-99");
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body as string);
    const nonSystemMessages = body.messages.filter((m: { role: string }) => m.role !== "system");
    // Only the new user message should be present (no prior history)
    expect(nonSystemMessages).toHaveLength(1);
    expect(nonSystemMessages[0]).toMatchObject({ role: "user", content: "hi again" });
  });
});
```

**Step 2: 失敗を確認**

```bash
npx vitest run src/__tests__/ollama.test.ts
```

Expected: FAIL

**Step 3: 実装**

`src/ollama.ts` の `createOllamaHandler` の return 文に `clearHistory` を追加：

```ts
return {
  async ask(prompt: string, channelId: string): Promise<string> {
    // ... 既存の実装 ...
  },
  clearHistory(channelId: string): void {
    historyMap.delete(channelId);
  },
};
```

**Step 4: テストが通ることを確認**

```bash
npx vitest run src/__tests__/ollama.test.ts
```

Expected: PASS（全テスト）

**Step 5: コミット**

```bash
git add src/ollama.ts src/__tests__/ollama.test.ts
git commit -m "feat: implement clearHistory in Ollama handler"
```

---

### Task 5: `bot.ts` に `!clear` コマンドを追加

**Files:**
- Modify: `src/bot.ts`
- Test: `src/__tests__/bot.test.ts`

**Step 1: テストを書く（失敗するはず）**

`src/__tests__/bot.test.ts` に以下の `describe` ブロックを追加（`describe("channel command routing", ...)` の後など）：

```ts
describe("clear command routing", () => {
  it("should route !clear command to onClearCommand when provided", async () => {
    // Given: a bot with onClearCommand handler
    const onClearCommand = vi.fn().mockReturnValue("このチャンネルのコンテキストをクリアしました。");
    createBot({ token: "test-token", onMessage, onClearCommand });
    const handler = getMessageCreateHandler();
    const message = createMockMessage({
      content: "<@12345> !clear",
    });

    // When: the handler processes a !clear message
    await handler(message);

    // Then: onClearCommand is called with channelId, onMessage is not called
    expect(onClearCommand).toHaveBeenCalledWith("channel-123");
    expect(onMessage).not.toHaveBeenCalled();
    expect(message.channel.send).toHaveBeenCalledWith("このチャンネルのコンテキストをクリアしました。");
  });

  it("should fall through to onMessage when onClearCommand is not provided", async () => {
    // Given: a bot without onClearCommand handler
    createBot({ token: "test-token", onMessage });
    const handler = getMessageCreateHandler();
    const message = createMockMessage({
      content: "<@12345> !clear",
    });

    // When: the handler processes a !clear message
    await handler(message);

    // Then: onMessage is called with the command text
    expect(onMessage).toHaveBeenCalledWith("!clear", "channel-123");
  });
});
```

**Step 2: 失敗を確認**

```bash
npx vitest run src/__tests__/bot.test.ts
```

Expected: FAIL

**Step 3: 実装**

`src/bot.ts` の `BotConfig` 型に追加：

```ts
export type BotConfig = {
  token: string;
  onMessage: (content: string, channelId: string) => Promise<string>;
  onToneCommand?: (args: string) => string;
  onCalendarCommand?: (args: string, channelId: string) => Promise<string>;
  onCalendarInput?: (content: string, channelId: string) => Promise<{ handled: boolean; response: string }>;
  onChannelCommand?: (args: string, channelId: string) => string;
  onClearCommand?: (channelId: string) => string;
  isAlwaysOnChannel?: (channelId: string) => boolean;
};
```

`handleMessage` 関数内の `!channel` ブロックの直後（`if (!prompt.startsWith("!") ...` の前）に追加：

```ts
if (prompt === "!clear" && config.onClearCommand) {
  const response = config.onClearCommand(channel.id);
  await channel.send(response);
  return;
}
```

**Step 4: テストが通ることを確認**

```bash
npx vitest run src/__tests__/bot.test.ts
```

Expected: PASS（全テスト）

**Step 5: コミット**

```bash
git add src/bot.ts src/__tests__/bot.test.ts
git commit -m "feat: add !clear command routing to bot"
```

---

### Task 6: `index.ts` で `onClearCommand` を接続

**Files:**
- Modify: `src/index.ts`
- Test: `src/__tests__/index.test.ts`

**Step 1: 既存テストを確認**

```bash
npx vitest run src/__tests__/index.test.ts
```

Expected: 全テスト PASS（ベースラインの確認）

**Step 2: テストを書く（失敗するはず）**

`src/__tests__/index.test.ts` を確認し、`createBot` のモックが `onClearCommand` を受け取ることを検証するテストを追加する。ファイルの構造に合わせて以下のようなテストを追加：

```ts
it("should pass onClearCommand to createBot", () => {
  // Given/When: createBot is called (via index.ts startup)

  // Then: onClearCommand is provided in the bot config
  const botConfig = mockCreateBot.mock.calls[0][0];
  expect(botConfig.onClearCommand).toBeDefined();
  expect(typeof botConfig.onClearCommand).toBe("function");
});

it("should clear handler history when onClearCommand is called", () => {
  // Given: the onClearCommand from bot config
  const botConfig = mockCreateBot.mock.calls[0][0];
  const onClearCommand = botConfig.onClearCommand as (channelId: string) => string;

  // When: onClearCommand is called
  const result = onClearCommand("channel-42");

  // Then: returns confirmation message
  expect(result).toBe("このチャンネルのコンテキストをクリアしました。");
});
```

**Step 3: 失敗を確認**

```bash
npx vitest run src/__tests__/index.test.ts
```

Expected: FAIL

**Step 4: 実装**

`src/index.ts` の `createBot(...)` 呼び出しに `onClearCommand` を追加：

```ts
createBot({
  token: discordToken,
  onMessage: (prompt, channelId) => { /* 既存コード */ },
  onToneCommand: (args) => handleToneCommand(args, { toneStore, sessionStore }),
  onCalendarCommand: (args, channelId) => calendarController.handleCommand(args, channelId),
  onCalendarInput: (content, channelId) => calendarController.handleNaturalLanguageInput(content, channelId),
  onChannelCommand: (args, channelId) => channelController.handleCommand(args, channelId),
  onClearCommand: (channelId) => {
    handler.clearHistory?.(channelId);
    return "このチャンネルのコンテキストをクリアしました。";
  },
  isAlwaysOnChannel: (channelId) => channelStore.isAlwaysOn(channelId),
});
```

**Step 5: テストが通ることを確認**

```bash
npx vitest run src/__tests__/index.test.ts
```

Expected: PASS（全テスト）

**Step 6: 全テストが通ることを確認**

```bash
npm test
```

Expected: 全テスト PASS

**Step 7: コミット**

```bash
git add src/index.ts src/__tests__/index.test.ts
git commit -m "feat: wire onClearCommand in index.ts"
```

---

### Task 7: 最終確認

**Step 1: 全テストを実行**

```bash
npm test
```

Expected: 全テスト PASS

**Step 2: 型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし
