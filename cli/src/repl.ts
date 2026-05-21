import readline from "readline";
import chalk from "chalk";
import { loadConfig, saveConfig } from "./config.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import { streamLLM, buildSystemPrompt, type Message } from "./llm/index.js";
import {
  renderUserMessage,
  renderAssistantPrefix,
  renderAssistantToken,
  renderAssistantEnd,
  renderToolCall,
  renderToolResult,
  renderError,
  renderInfo,
  renderSuccess,
  renderThinking,
  clearThinking,
} from "./ui/renderer.js";
import { printHelp } from "./ui/banner.js";
import { listOllamaModels } from "./llm/ollama.js";
import { compactHistory } from "./compact.js";
import { ensureOllama } from "./ollama-start.js";

export async function runRepl(): Promise<void> {
  let config = loadConfig();
  const history: Message[] = [];
  let currentAbortController: AbortController | null = null;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
  });

  const prompt = () => {
    const providerTag =
      config.provider === "cerebras"
        ? chalk.cyan(`cerebras:${config.cerebrasModel}`)
        : chalk.green(`ollama:${config.ollamaModel}`);
    rl.setPrompt(`  ${chalk.dim("[")}${providerTag}${chalk.dim("]")} ${chalk.white("❯")} `);
    rl.prompt();
  };

  rl.on("close", () => {
    console.log();
    console.log(chalk.dim("  Goodbye!"));
    process.exit(0);
  });

  process.on("SIGINT", () => {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
      console.log();
      console.log(chalk.dim("  (interrupted)"));
      console.log();
      prompt();
    } else {
      console.log();
      console.log(chalk.dim("  Goodbye!"));
      process.exit(0);
    }
  });

  prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      prompt();
      continue;
    }

    if (input.startsWith("/")) {
      await handleCommand(input, config, (newConfig) => {
        config = newConfig;
      }, history, (newHistory) => {
        history.length = 0;
        history.push(...newHistory);
      });
      prompt();
      continue;
    }

    renderUserMessage(input);
    history.push({ role: "user", content: input });

    try {
      currentAbortController = new AbortController();
      await processMessage(history, config, currentAbortController);
      currentAbortController = null;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        history.pop();
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        // If Ollama dropped, try to restart it then retry once
        if (config.provider === "ollama" && msg.includes("Cannot connect to Ollama")) {
          renderInfo("Ollama connection lost — attempting to restart…");
          await ensureOllama(config.ollamaBaseUrl);
          try {
            currentAbortController = new AbortController();
            await processMessage(history, config, currentAbortController);
            currentAbortController = null;
          } catch (retryErr) {
            history.pop();
            renderError(retryErr instanceof Error ? retryErr.message : String(retryErr));
          }
        } else {
          renderError(msg);
          history.pop();
        }
      }
    }

    prompt();
  }
}

const MAX_HISTORY_MESSAGES = 40;

function trimHistory(history: Message[]): Message[] {
  if (history.length <= MAX_HISTORY_MESSAGES) return history;
  const trimmed = history.slice(history.length - MAX_HISTORY_MESSAGES);
  // Never start mid-tool-call: drop leading tool messages that have no matching assistant call
  const firstUserOrAssistant = trimmed.findIndex(
    (m) => m.role === "user" || m.role === "assistant"
  );
  return firstUserOrAssistant > 0 ? trimmed.slice(firstUserOrAssistant) : trimmed;
}

async function processMessage(
  history: Message[],
  config: ReturnType<typeof loadConfig>,
  abort: AbortController
): Promise<void> {
  const tools = getToolDefinitions(config);
  const systemPrompt = buildSystemPrompt();

  let isFirst = true;
  let assistantContent = "";
  const MAX_TOOL_ROUNDS = 20;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (abort.signal.aborted) break;

    let thinkingInterval: NodeJS.Timeout | null = null;
    if (isFirst) {
      thinkingInterval = renderThinking();
    }

    const stream = streamLLM(config, trimHistory(history), tools, systemPrompt, abort.signal);
    let firstToken = true;
    const pendingToolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> = [];

    try {
      for await (const chunk of stream) {
        if (abort.signal.aborted) break;

        if (chunk.type === "token" && chunk.content) {
          if (thinkingInterval) {
            clearThinking(thinkingInterval);
            thinkingInterval = null;
          }
          if (firstToken) {
            renderAssistantPrefix();
            firstToken = false;
          }
          renderAssistantToken(chunk.content);
          assistantContent += chunk.content;
        } else if (chunk.type === "tool_call" && chunk.toolCalls) {
          if (thinkingInterval) {
            clearThinking(thinkingInterval);
            thinkingInterval = null;
          }
          if (!firstToken) {
            renderAssistantEnd();
          }
          firstToken = false;
          pendingToolCalls.push(...chunk.toolCalls);
        } else if (chunk.type === "done") {
          if (thinkingInterval) {
            clearThinking(thinkingInterval);
            thinkingInterval = null;
          }
          if (!firstToken && pendingToolCalls.length === 0) {
            renderAssistantEnd();
          }
        }
      }
    } finally {
      if (thinkingInterval) {
        clearThinking(thinkingInterval);
      }
    }

    isFirst = false;

    if (pendingToolCalls.length === 0) {
      if (assistantContent) {
        history.push({ role: "assistant", content: assistantContent });
      }
      break;
    }

    const assistantMsg: Message = {
      role: "assistant",
      content: assistantContent || "",
      tool_calls: pendingToolCalls,
    };
    history.push(assistantMsg);
    assistantContent = "";

    for (const toolCall of pendingToolCalls) {
      if (abort.signal.aborted) break;

      let toolInput: Record<string, unknown> = {};
      try {
        toolInput = JSON.parse(toolCall.function.arguments);
      } catch {
        toolInput = {};
      }

      renderToolCall({
        name: toolCall.function.name,
        input: toolInput,
      });

      let toolOutput = "";
      let isError = false;

      try {
        toolOutput = await executeTool(toolCall.function.name, toolInput, config);
      } catch (err) {
        toolOutput = err instanceof Error ? err.message : String(err);
        isError = true;
      }

      renderToolResult({
        name: toolCall.function.name,
        output: toolOutput,
        error: isError,
      });

      history.push({
        role: "tool",
        content: isError ? `Error: ${toolOutput}` : toolOutput,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    }

    if (abort.signal.aborted) break;
  }
}

async function handleCommand(
  input: string,
  config: ReturnType<typeof loadConfig>,
  setConfig: (c: ReturnType<typeof loadConfig>) => void,
  history: Message[],
  setHistory: (h: Message[]) => void
): Promise<void> {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case "help":
      printHelp();
      break;

    case "clear":
      console.clear();
      renderInfo("Conversation history cleared.");
      console.log();
      break;

    case "status": {
      console.log();
      console.log(chalk.bold.white("  Status"));
      console.log();
      console.log(
        "  " +
          chalk.dim("Provider:  ") +
          (config.provider === "cerebras"
            ? chalk.cyan("Cerebras AI")
            : chalk.green("Ollama (local)"))
      );
      if (config.provider === "cerebras") {
        console.log(
          "  " + chalk.dim("Model:     ") + chalk.white(config.cerebrasModel)
        );
        process.stdout.write("  " + chalk.dim("API Key:   "));
        if (!config.cerebrasApiKey) {
          process.stdout.write(chalk.red("✗ missing\n"));
        } else {
          process.stdout.write(chalk.dim("checking…"));
          try {
            const res = await fetch("https://api.cerebras.ai/v1/models", {
              headers: { Authorization: `Bearer ${config.cerebrasApiKey}` },
              signal: AbortSignal.timeout(5000),
            });
            process.stdout.write(
              "\r  " + chalk.dim("API Key:   ") +
              (res.ok ? chalk.green("✓ valid\n") : chalk.red(`✗ rejected (HTTP ${res.status})\n`))
            );
          } catch {
            process.stdout.write("\r  " + chalk.dim("API Key:   ") + chalk.yellow("✓ set (could not verify)\n"));
          }
        }
      } else {
        console.log(
          "  " + chalk.dim("Model:     ") + chalk.white(config.ollamaModel)
        );
        process.stdout.write("  " + chalk.dim("URL:       ") + chalk.white(config.ollamaBaseUrl) + "  ");
        try {
          const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
          process.stdout.write(res.ok ? chalk.green("✓ reachable\n") : chalk.red(`✗ HTTP ${res.status}\n`));
        } catch {
          process.stdout.write(chalk.red("✗ not reachable\n"));
        }
      }
      console.log(
        "  " +
          chalk.dim("Search:    ") +
          (config.tavilyApiKey
            ? chalk.green("✓ Tavily configured")
            : chalk.dim("✗ not configured"))
      );
      console.log(
        "  " +
          chalk.dim("CWD:       ") +
          chalk.white(process.cwd())
      );
      console.log();
      break;
    }

    case "model": {
      const sub = parts[1]?.toLowerCase();
      const arg3 = parts[2];

      if (!sub) {
        console.log();
        console.log(
          chalk.dim("  Usage: /model cerebras | /model ollama | /model ollama <name>")
        );
        console.log();
        break;
      }

      if (sub === "cerebras") {
        const newConfig = {
          ...config,
          provider: "cerebras" as const,
          ...(arg3 ? { cerebrasModel: arg3 } : {}),
        };
        saveConfig({ provider: "cerebras", ...(arg3 ? { cerebrasModel: arg3 } : {}) });
        setConfig(newConfig);
        renderSuccess(`Switched to Cerebras AI (${newConfig.cerebrasModel})`);
        console.log();
      } else if (sub === "ollama") {
        if (arg3) {
          const newConfig = {
            ...config,
            provider: "ollama" as const,
            ollamaModel: arg3,
          };
          saveConfig({ provider: "ollama", ollamaModel: arg3 });
          setConfig(newConfig);
          renderSuccess(`Switched to Ollama model: ${arg3}`);
        } else {
          renderInfo("Checking available Ollama models…");
          const models = await listOllamaModels(config.ollamaBaseUrl);
          if (models.length === 0) {
            renderError(
              "No Ollama models found. Make sure Ollama is running."
            );
          } else {
            console.log();
            models.slice(0, 15).forEach((m, i) => {
              const isCurrent = m === config.ollamaModel;
              console.log(
                "  " +
                  chalk.cyan(String(i + 1)) +
                  " " +
                  (isCurrent ? chalk.bold.white(m) + chalk.dim(" ← current") : chalk.white(m))
              );
            });
            console.log();
            const newConfig = { ...config, provider: "ollama" as const };
            saveConfig({ provider: "ollama" });
            setConfig(newConfig);
            renderInfo("Use /model ollama <name> to select a specific model.");
          }
        }
        console.log();
      } else {
        renderError(`Unknown provider: ${sub}. Use "cerebras" or "ollama".`);
        console.log();
      }
      break;
    }

    case "compact": {
      if (history.length === 0) {
        renderInfo("Nothing to compact — conversation history is empty.");
        console.log();
        break;
      }
      const originalCount = history.length;
      const thinking = renderThinking();
      try {
        const { compacted, tokensSaved } = await compactHistory(history, config);
        clearThinking(thinking);
        setHistory(compacted);
        renderSuccess(
          `History compacted: ${originalCount} messages → 2  (~${Math.round(tokensSaved / 4)} tokens saved)`
        );
        console.log();
      } catch (err) {
        clearThinking(thinking);
        renderError(err instanceof Error ? err.message : String(err));
        console.log();
      }
      break;
    }

    case "exit":
    case "quit":
    case "q":
      console.log(chalk.dim("  Goodbye!"));
      process.exit(0);
      break;

    default:
      renderError(`Unknown command: /${cmd}. Type /help for available commands.`);
      console.log();
  }
}
