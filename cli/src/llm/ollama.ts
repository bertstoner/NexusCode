import type { ToolDefinition } from "../tools/index.js";

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OllamaToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamChunk {
  type: "token" | "tool_call" | "done";
  content?: string;
  toolCalls?: OllamaToolCall[];
}

export async function* streamOllama(
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[],
  systemPrompt: string,
  temperature: number = 0.2,
  maxTokens: number = 8192,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    stream: true,
    tools: tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    options: {
      temperature,
      num_predict: maxTokens,
    },
  };

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  if (!response.body) {
    throw new Error("No response body from Ollama");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const accumulatedCalls: OllamaToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as {
          message?: {
            content?: string;
            tool_calls?: OllamaToolCall[];
          };
          done?: boolean;
        };

        const msg = parsed.message;
        if (!msg) continue;

        if (msg.content) {
          yield { type: "token", content: msg.content };
        }

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const calls = msg.tool_calls.map((tc, i) => ({
            ...tc,
            id: tc.id || `ollama-tool-${Date.now()}-${i}`,
          }));
          accumulatedCalls.push(...calls);
        }

        if (parsed.done && accumulatedCalls.length > 0) {
          yield { type: "tool_call", toolCalls: [...accumulatedCalls] };
        }
      } catch {
      }
    }
  }

  yield { type: "done" };
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
