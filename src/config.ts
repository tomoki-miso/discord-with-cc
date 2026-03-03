// Inline type to avoid circular dependency (ollama-tools → config → ollama → ollama-tools)
type OllamaModelOptions = {
  num_ctx?: number;
  temperature?: number;
  top_p?: number;
  num_predict?: number;
};

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

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

export const config = {
  discord: {
    get token(): string { return requireEnv("DISCORD_TOKEN"); },
  },
  agent: {
    get type(): string { return process.env.AGENT_TYPE ?? "claude"; },
    get workDir(): string | undefined {
      return process.env.AGENT_WORK_DIR ?? process.env.CLAUDE_WORK_DIR;
    },
  },
  ollama: {
    get apiUrl(): string { return process.env.OLLAMA_URL ?? "http://localhost:11434"; },
    get model(): string { return process.env.OLLAMA_MODEL ?? ""; },
    get options(): OllamaModelOptions { return parseOllamaOptions(process.env); },
  },
  tavily: {
    get apiKey(): string | undefined { return process.env.TAVILY_API_KEY; },
  },
};
