import type { ToolDefinition } from "./fs.js";

export const searchToolDefinition: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for up-to-date information using Tavily. Use this to find documentation, look up APIs, research topics, or find current information that may not be in your training data.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return (default: 5, max: 10)",
      },
    },
    required: ["query"],
  },
};

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export async function webSearch(
  query: string,
  tavilyApiKey: string,
  maxResults: number = 5
): Promise<string> {
  if (!tavilyApiKey) {
    return "Web search unavailable: no Tavily API key configured. Run with --setup to add one.";
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tavilyApiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: Math.min(maxResults, 10),
      search_depth: "basic",
      include_answer: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily search failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TavilyResponse;

  const parts: string[] = [];

  if (data.answer) {
    parts.push(`**Summary:** ${data.answer}\n`);
  }

  for (const result of data.results ?? []) {
    parts.push(`**${result.title}**`);
    parts.push(`URL: ${result.url}`);
    parts.push(result.content);
    parts.push("");
  }

  return parts.join("\n") || "No results found.";
}
