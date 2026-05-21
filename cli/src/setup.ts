import readline from "readline";
import chalk from "chalk";
import { saveConfig, loadConfig, getConfigPath } from "./config.js";
import { listOllamaModels } from "./llm/ollama.js";

// ---------------------------------------------------------------------------
// Arrow-key dropdown selector
// ---------------------------------------------------------------------------

function promptSelect(label: string, items: string[], defaultIndex = 0): Promise<number> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let selected = Math.max(0, Math.min(defaultIndex, items.length - 1));
    let done = false;

    const render = () => {
      // Move cursor up to redraw the list
      if (renderCount > 0) {
        process.stdout.write(`\x1b[${renderCount}A`);
      }
      items.forEach((item, i) => {
        const line = i === selected
          ? `  ${chalk.cyan("❯")} ${chalk.bold.white(item)}`
          : `    ${chalk.dim(item)}`;
        process.stdout.write(`\r${line}\x1b[K\n`);
      });
      renderCount = items.length;
    };

    let renderCount = 0;
    console.log();
    console.log(chalk.bold.white(`  ${label}`));
    console.log();
    render();

    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    const onData = (chunk: string) => {
      if (done) return;

      if (chunk === "\x1b[A" || chunk === "\x1b\x5b\x41") {
        // Up arrow
        selected = (selected - 1 + items.length) % items.length;
        render();
      } else if (chunk === "\x1b[B" || chunk === "\x1b\x5b\x42") {
        // Down arrow
        selected = (selected + 1) % items.length;
        render();
      } else if (chunk === "\r" || chunk === "\n" || chunk === "") {
        done = true;
        if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener("data", onData);
        console.log();
        resolve(selected);
      } else if (chunk === "") {
        process.exit(0);
      }
    };

    stdin.on("data", onData);
  });
}

// ---------------------------------------------------------------------------
// Plain text prompt
// ---------------------------------------------------------------------------

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Hidden input (API keys)
// ---------------------------------------------------------------------------

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let input = "";
    let done = false;

    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    const submit = () => {
      if (done) return;
      done = true;
      if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(input.trim());
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (done) return;
        if (char === "\n" || char === "\r" || char === "") {
          submit();
          return;
        } else if (char === "") {
          process.exit(0);
        } else if (char === "" || char === "\b") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          input += char;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

export async function runSetup(isFirstRun = false): Promise<void> {
  const config = loadConfig();

  console.log();
  if (isFirstRun) {
    console.log(chalk.bold.cyan("  ╭─────────────────────────────────────╮"));
    console.log(chalk.bold.cyan("  │     Welcome to nexus setup!         │"));
    console.log(chalk.bold.cyan("  ╰─────────────────────────────────────╯"));
    console.log();
    console.log(chalk.white("  Let's configure your AI coding assistant."));
    console.log(chalk.dim("  You can re-run setup anytime with: nexus --setup"));
  } else {
    console.log(chalk.bold.white("  nexus Configuration"));
  }

  // ── Provider ──────────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.white("  ── Provider ──────────────────────────────"));

  const providerItems = [
    "Cerebras AI  (online, fast — llama3.3-70b and more)",
    "Ollama       (local, private — any installed model)",
  ];
  const providerDefault = config.provider === "ollama" ? 1 : 0;
  const providerIdx = await promptSelect("Select provider", providerItems, providerDefault);
  const provider = providerIdx === 1 ? "ollama" : "cerebras";

  console.log();

  // ── Cerebras ──────────────────────────────────────────────────────────────
  if (provider === "cerebras") {
    console.log(chalk.bold.white("  ── Cerebras AI ────────────────────────────"));
    console.log();
    console.log(chalk.dim("  Get your API key at: ") + chalk.cyan("https://cloud.cerebras.ai"));
    console.log();

    const cerebrasKey = await promptHidden(
      chalk.dim("  Cerebras API key") +
        chalk.dim(config.cerebrasApiKey ? " [keep existing]: " : ": ")
    );
    const finalKey = cerebrasKey || config.cerebrasApiKey || "";

    // Model selection
    const cerebrasModelItems = [
      "llama3.3-70b  (recommended)",
      "llama3.1-8b   (faster, lower memory)",
      "custom model name…",
    ];
    const currentCerebrasIdx =
      config.cerebrasModel === "llama3.1-8b" ? 1 : 0;

    console.log();
    console.log(chalk.bold.white("  ── Model ──────────────────────────────────"));

    const modelIdx = await promptSelect("Select model", cerebrasModelItems, currentCerebrasIdx);

    let model = config.cerebrasModel;
    if (modelIdx === 0) model = "llama3.3-70b";
    else if (modelIdx === 1) model = "llama3.1-8b";
    else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      model = await prompt(rl, chalk.dim("  Model name: "));
      rl.close();
    }

    // Tavily
    console.log();
    console.log(chalk.bold.white("  ── Tavily Web Search (optional) ────────────"));
    console.log();
    console.log(chalk.dim("  Get your API key at: ") + chalk.cyan("https://app.tavily.com"));
    console.log();

    const tavilyKey = await promptHidden(
      chalk.dim("  Tavily API key") +
        chalk.dim(config.tavilyApiKey ? " [keep existing]: " : " (optional): ")
    );
    const finalTavilyKey = tavilyKey || config.tavilyApiKey || "";

    saveConfig({
      provider: "cerebras",
      cerebrasApiKey: finalKey,
      cerebrasModel: model,
      tavilyApiKey: finalTavilyKey || undefined,
    });

  // ── Ollama ────────────────────────────────────────────────────────────────
  } else {
    console.log(chalk.bold.white("  ── Ollama ──────────────────────────────────"));
    console.log();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const defaultUrl = config.ollamaBaseUrl || "http://localhost:11434";
    const ollamaUrl = await prompt(rl, chalk.dim(`  Ollama URL [${defaultUrl}]: `));
    rl.close();
    const finalUrl = ollamaUrl || defaultUrl;

    console.log(chalk.dim("  Checking available models…"));
    const models = await listOllamaModels(finalUrl);

    let model = config.ollamaModel;

    if (models.length === 0) {
      console.log(chalk.yellow("  ⚠ No models found — Ollama may not be running."));
      console.log(chalk.dim("  The model will be pulled automatically on first use."));
      console.log();

      const knownModels = [
        "llama3.2:1b   (~1 GB, fast)",
        "llama3.1      (~4.7 GB)",
        "mistral       (~4 GB)",
        "codellama     (~4 GB, code-focused)",
        "custom model name…",
      ];
      console.log(chalk.bold.white("  ── Model ──────────────────────────────────"));
      const modelIdx = await promptSelect("Select model", knownModels, 0);

      if (modelIdx === 0) model = "llama3.2:1b";
      else if (modelIdx === 1) model = "llama3.1";
      else if (modelIdx === 2) model = "mistral";
      else if (modelIdx === 3) model = "codellama";
      else {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        model = await prompt(rl2, chalk.dim("  Model name: "));
        rl2.close();
      }
    } else {
      const modelItems = [
        ...models.slice(0, 15),
        ...(models.length > 15 ? [`… and ${models.length - 15} more (type name below)`] : []),
        "custom model name…",
      ];
      const currentIdx = Math.max(0, models.indexOf(config.ollamaModel));

      console.log(chalk.bold.white("  ── Model ──────────────────────────────────"));
      const modelIdx = await promptSelect("Select model", modelItems, currentIdx);

      if (modelIdx < models.length) {
        model = models[modelIdx];
      } else {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        model = await prompt(rl2, chalk.dim("  Model name: "));
        rl2.close();
      }
    }

    // Tavily
    console.log();
    console.log(chalk.bold.white("  ── Tavily Web Search (optional) ────────────"));
    console.log();
    console.log(chalk.dim("  Get your API key at: ") + chalk.cyan("https://app.tavily.com"));
    console.log();

    const tavilyKey = await promptHidden(
      chalk.dim("  Tavily API key") +
        chalk.dim(config.tavilyApiKey ? " [keep existing]: " : " (optional): ")
    );
    const finalTavilyKey = tavilyKey || config.tavilyApiKey || "";

    saveConfig({
      provider: "ollama",
      ollamaBaseUrl: finalUrl,
      ollamaModel: model,
      tavilyApiKey: finalTavilyKey || undefined,
    });
  }

  console.log();
  console.log(chalk.green("  ✓ Configuration saved to: ") + chalk.dim(getConfigPath()));
  console.log();
  console.log(chalk.white("  Ready! Start coding with: ") + chalk.cyan("nexus"));
  console.log();
}
