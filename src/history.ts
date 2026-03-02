export type SessionStore = {
  get(channelId: string): string | undefined;
  set(channelId: string, sessionId: string): void;
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
  };
}
