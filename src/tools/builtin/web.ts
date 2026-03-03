import TurndownService from "turndown";
import type { OllamaToolDef } from "../types.js";

const td = new TurndownService();

export const WEB_TOOL_DEFS: OllamaToolDef[] = [
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch content from a URL and return the text",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information and return relevant results",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
];

export async function executeWebTool(
  name: string,
  args: Record<string, unknown>,
  tavilyApiKey: string | undefined,
): Promise<string | null> {
  switch (name) {
    case "web_fetch": {
      console.error(`[ollama-tools] web_fetch: ${args.url as string}`);
      const response = await fetch(args.url as string);
      const html = await response.text();
      const markdown = td.turndown(html);
      console.error(`[ollama-tools] web_fetch: ${response.status} ${response.statusText}, ${markdown.length} chars (markdown)`);
      return markdown;
    }

    case "web_search": {
      const query = args.query as string;
      if (!tavilyApiKey) return "Error: TAVILY_API_KEY is not set";
      console.error(`[ollama-tools] web_search: "${query}"`);
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyApiKey, query, max_results: 5 }),
      });
      const data = await res.json() as { results?: { title: string; url: string; content: string }[] };
      const results = data.results ?? [];
      console.error(`[ollama-tools] web_search: ${results.length} results`);
      if (results.length === 0) return "No results found";
      return results
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
        .join("\n\n");
    }

    default:
      return null;
  }
}
