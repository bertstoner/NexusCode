import chalk from "chalk";
import { configExists } from "./config.js";
import { runSetup } from "./setup.js";
import { runRepl } from "./repl.js";
import { printBanner } from "./ui/banner.js";
import { loadConfig } from "./config.js";

const args = process.argv.slice(2);
const isSetup = args.includes("--setup") || args.includes("-s");
const isHelp = args.includes("--help") || args.includes("-h");
const isVersion = args.includes("--version") || args.includes("-v");

if (isVersion) {
  console.log("code-ai 1.0.0");
  process.exit(0);
}

if (isHelp) {
  console.log(`
${chalk.bold.cyan("code-ai")} — AI Coding Assistant

${chalk.bold("Usage:")}
  code-ai              Start interactive session
  code-ai --setup      Configure provider and API keys
  code-ai --version    Show version
  code-ai --help       Show this help

${chalk.bold("Providers:")}
  Cerebras AI    Fast online inference (llama-3.3-70b and more)
  Ollama         Local private inference (any installed model)

${chalk.bold("In-session commands:")}
  /help          Show available commands
  /model         Switch provider or model
  /clear         Clear conversation history
  /status        Show current configuration
  /exit          Exit the session

${chalk.bold("Config location:")}
  ~/.config/code-ai/config.json
`);
  process.exit(0);
}

async function main() {
  if (isSetup) {
    await runSetup(false);
    return;
  }

  if (!configExists()) {
    console.log();
    console.log(
      chalk.bold.cyan("  Welcome to code-ai!") +
        chalk.dim(" First-time setup required.")
    );
    await runSetup(true);
    console.log();
  }

  const config = loadConfig();
  printBanner(config);
  await runRepl();
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
