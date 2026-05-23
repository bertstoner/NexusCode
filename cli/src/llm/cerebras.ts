import type { Message } from "./ollama.js";
import type { ToolDefinition } from "../tools/index.js";
import type { StreamChunk } from "./ollama.js";

interface CerebrasToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface CerebrasStreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export async function* streamCerebras(
  apiKey: string,
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
      ...messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            content: m.content,
            tool_call_id: m.tool_call_id,
          };
        }
        if (m.tool_calls) {
          return {
            role: "assistant",
            content: m.content ?? null,
            tool_calls: m.tool_calls,
          };
        }
        return { role: m.role, content: m.content };
      }),
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
    tool_choice: "auto",
    max_tokens: maxTokens,
    temperature,
  };

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Cerebras API error (HTTP ${response.status}) — check your API key and model name`);
  }

  if (!response.body) {
    throw new Error("No response body from Cerebras");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const partialToolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > 5 * 1024 * 1024) {
      reader.cancel();
      throw new Error("Cerebras response exceeded 5MB limit");
    }
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        if (partialToolCalls.size > 0) {
          const toolCalls: CerebrasToolCall[] = [];
          for (const [, call] of partialToolCalls) {
            toolCalls.push({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            });
          }
          yield { type: "tool_call", toolCalls };
        }
        yield { type: "done" };
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: CerebrasStreamDelta;
            finish_reason?: string | null;
          }>;
        };

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: "token", content: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!partialToolCalls.has(idx)) {
              partialToolCalls.set(idx, { id: tc.id || `cerebras-${Date.now()}-${idx}`, name: "", arguments: "" });
            }
            const existing = partialToolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      } catch {
      }
    }
  }

  yield { type: "done" };
}
