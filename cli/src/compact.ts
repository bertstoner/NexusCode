import type { Config } from "./config.js";
import type { Message } from "./llm/ollama.js";
import { streamLLM } from "./llm/index.js";

const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer for a coding assistant session.

Produce a concise but complete technical summary of the conversation below. The summary will replace the full history, so it must contain enough detail to continue the work without the original messages.

Always include:
- Files read, created, or modified (exact paths)
- Code changes made and the reason for each
- Architectural decisions and trade-offs discussed
- Errors encountered and how they were resolved
- Current task state: what is done, what is in progress, what is next

Be specific. Omit pleasantries and meta-commentary. Write in past tense, third person.`;

export async function compactHistory(
  history: Message[],
  config: Config,
  signal?: AbortSignal
): Promise<{ compacted: Message[]; tokensSaved: number }> {
  if (history.length === 0) {
    return { compacted: [], tokensSaved: 0 };
  }

  const originalLength = history.reduce((n, m) => n + m.content.length, 0);

  const requestMessages: Message[] = [
    ...history,
    {
      role: "user",
      content:
        "Summarize this conversation per your instructions. Be thorough — this replaces the full history.",
    },
  ];

  let summary = "";
  const stream = streamLLM(config, requestMessages, [], COMPACT_SYSTEM_PROMPT, signal);
  for await (const chunk of stream) {
    if (chunk.type === "token" && chunk.content) {
      summary += chunk.content;
    }
  }

  if (!summary.trim()) {
    throw new Error("LLM returned an empty summary — history was not compacted.");
  }

  const compacted: Message[] = [
    {
      role: "user",
      content: `[Conversation compacted. Summary of prior context:\n\n${summary.trim()}]`,
    },
    {
      role: "assistant",
      content: "Understood. I have the summary of our previous session. What would you like to do next?",
    },
  ];

  const compactedLength = compacted.reduce((n, m) => n + m.content.length, 0);
  const tokensSaved = Math.max(0, originalLength - compactedLength);

  return { compacted, tokensSaved };
}
