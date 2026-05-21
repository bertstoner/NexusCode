import readline from "readline";
import chalk from "chalk";
import { saveConfig, loadConfig, getConfigPath } from "./config.js";
import { listOllamaModels } from "./llm/ollama.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let input = "";

    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf-8");

    const onData = (char: string) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "\u0003") {
        process.exit(0);
      } else if (char === "\u007f" || char === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        input += char;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

export async function runSetup(isFirstRun = false): Promise<void> {
  const config = loadConfig();

  console.log();
  if (isFirstRun) {
    console.log(chalk.bold.cyan("  ╭─────────────────────────────────────╮"));
    console.log(chalk.bold.cyan("  │     Welcome to nexus setup!       │"));
    console.log(chalk.bold.cyan("  ╰─────────────────────────────────────╯"));
    console.log();
    console.log(
      chalk.white("  Let's configure your AI coding assistant.")
    );
    console.log(
      chalk.dim("  You can re-run setup anytime with: nexus --setup")
    );
  } else {
    console.log(chalk.bold.white("  nexus Configuration"));
  }
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(chalk.bold.white("  ── Provider ──────────────────────────────"));
    console.log();
    console.log(
      "  " +
        chalk.cyan("1") +
        chalk.white(" Cerebras AI") +
        chalk.dim(" (online, fast — llama-3.3-70b and more)")
    );
    console.log(
      "  " +
        chalk.cyan("2") +
        chalk.white(" Ollama") +
        chalk.dim(" (local, private — any installed model)")
    );
    console.log();

    const defaultChoice = config.provider === "ollama" ? "2" : "1";
    const providerChoice = await prompt(
      rl,
      chalk.dim(`  Select provider [${defaultChoice}]: `)
    );

    const provider =
      providerChoice === "2" ? "ollama" : "cerebras";

    console.log();

    if (provider === "cerebras") {
      console.log(chalk.bold.white("  ── Cerebras AI ────────────────────────────"));
      console.log();
      console.log(
        chalk.dim("  Get your API key at: ") +
          chalk.cyan("https://cloud.cerebras.ai")
      );
      console.log();

      rl.close();
      const cerebrasKey = await promptHidden(
        chalk.dim("  Cerebras API key") +
          chalk.dim(config.cerebrasApiKey ? " [keep existing]: " : ": ")
      );

      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const finalKey =
        cerebrasKey || config.cerebrasApiKey || "";

      let model = config.cerebrasModel;
      let tavilyKey = "";

      try {
        console.log();
        console.log(chalk.bold.white("  ── Model ──────────────────────────────────"));
        console.log();
        console.log(
          "  " + chalk.cyan("1") + chalk.dim(" llama-3.3-70b") + chalk.white(" (recommended)")
        );
        console.log("  " + chalk.cyan("2") + chalk.dim(" llama-3.1-8b") + chalk.white(" (faster)"));
        console.log("  " + chalk.cyan("3") + chalk.dim(" custom model name"));
        console.log();

        const modelChoice = await prompt(
          rl2,
          chalk.dim("  Select model [1]: ")
        );

        if (modelChoice === "2") model = "llama-3.1-8b";
        else if (modelChoice === "3") {
          model = await prompt(rl2, chalk.dim("  Model name: "));
        } else if (modelChoice === "1" || !modelChoice) {
          model = "llama-3.3-70b";
        }

        console.log();
        console.log(chalk.bold.white("  ── Tavily Web Search ───────────────────────"));
        console.log();
        console.log(
          chalk.dim("  Get your API key at: ") +
            chalk.cyan("https://app.tavily.com")
        );
        console.log(
          chalk.dim("  (Optional — skip to disable web search)")
        );
        console.log();
      } finally {
        rl2.close();
      }

      tavilyKey = await promptHidden(
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

      console.log();
      console.log(chalk.green("  ✓ Configuration saved to: ") + chalk.dim(getConfigPath()));
      console.log();
      console.log(
        chalk.white("  Ready! Start coding with: ") + chalk.cyan("nexus")
      );
      console.log();
    } else {
      console.log(chalk.bold.white("  ── Ollama ──────────────────────────────────"));
      console.log();

      const defaultUrl = config.ollamaBaseUrl || "http://localhost:11434";
      const ollamaUrl = await prompt(
        rl,
        chalk.dim(`  Ollama URL [${defaultUrl}]: `)
      );
      const finalUrl = ollamaUrl || defaultUrl;

      console.log(chalk.dim("  Checking available models…"));
      const models = await listOllamaModels(finalUrl);

      let model = config.ollamaModel;

      if (models.length === 0) {
        console.log(
          chalk.yellow("  ⚠ No models found. Make sure Ollama is running.")
        );
        console.log(
          chalk.dim(
            "  Install a model with: ollama pull llama3.1"
          )
        );
        const customModel = await prompt(
          rl,
          chalk.dim(`  Model name [${model}]: `)
        );
        model = customModel || model;
      } else {
        console.log(
          chalk.dim(`  Found ${models.length} model(s):`)
        );
        models.slice(0, 10).forEach((m, i) => {
          console.log(
            "  " + chalk.cyan(String(i + 1)) + " " + chalk.white(m)
          );
        });
        if (models.length > 10) {
          console.log(chalk.dim(`  … and ${models.length - 10} more`));
        }
        console.log();
        const choice = await prompt(
          rl,
          chalk.dim(`  Select model number or type name [${model}]: `)
        );
        if (choice) {
          const idx = parseInt(choice, 10) - 1;
          if (!isNaN(idx) && models[idx]) {
            model = models[idx];
          } else {
            model = choice;
          }
        }
      }

      console.log();
      console.log(chalk.bold.white("  ── Tavily Web Search ───────────────────────"));
      console.log();
      console.log(
        chalk.dim("  Get your API key at: ") +
          chalk.cyan("https://app.tavily.com")
      );
      console.log(chalk.dim("  (Optional — skip to disable web search)"));
      console.log();

      rl.close();

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

      console.log();
      console.log(chalk.green("  ✓ Configuration saved to: ") + chalk.dim(getConfigPath()));
      console.log();
      console.log(
        chalk.white("  Ready! Start coding with: ") + chalk.cyan("nexus")
      );
      console.log();
    }
  } catch (err) {
    try {
      rl.close();
    } catch {}
    throw err;
  }
}
