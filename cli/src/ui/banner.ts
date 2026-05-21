import chalk from "chalk";
import type { Config } from "../config.js";

export function printBanner(config: Config): void {
  const providerLabel =
    config.provider === "cerebras"
      ? chalk.cyan(`Cerebras · ${config.cerebrasModel}`)
      : chalk.green(`Ollama · ${config.ollamaModel}`);

  console.log();
  console.log(
    chalk.bold.white("  ╭─────────────────────────────────────────╮")
  );
  console.log(
    chalk.bold.white("  │") +
      chalk.bold.cyan("         nexus  ✦  AI Coding Assistant       ") +
      chalk.bold.white("│")
  );
  console.log(
    chalk.bold.white("  │") +
      chalk.dim("         Powered by ") +
      providerLabel +
      chalk.dim("             ") +
      chalk.bold.white("│")
  );
  console.log(
    chalk.bold.white("  ╰─────────────────────────────────────────╯")
  );
  console.log();
  console.log(
    chalk.dim(
      "  Type your request, or use a command:"
    )
  );
  console.log(
    chalk.dim("    /help") +
      chalk.white("      Show available commands")
  );
  console.log(
    chalk.dim("    /model") +
      chalk.white("     Switch model or provider")
  );
  console.log(
    chalk.dim("    /clear") +
      chalk.white("     Clear conversation history")
  );
  console.log(
    chalk.dim("    /status") +
      chalk.white("    Show current configuration")
  );
  console.log(
    chalk.dim("    /exit") +
      chalk.white("      Exit the session")
  );
  console.log();
}

export function printHelp(): void {
  console.log();
  console.log(chalk.bold.white("  Commands"));
  console.log();
  console.log(
    "  " + chalk.cyan("/help") + chalk.dim(" ......................... ") + "Show this help"
  );
  console.log(
    "  " + chalk.cyan("/model") + chalk.dim(" ........................ ") + "Switch provider/model"
  );
  console.log(
    "  " + chalk.cyan("/model cerebras") + chalk.dim(" ............... ") + "Use Cerebras (online)"
  );
  console.log(
    "  " + chalk.cyan("/model ollama") + chalk.dim(" ................. ") + "Use Ollama (local)"
  );
  console.log(
    "  " + chalk.cyan("/model ollama <name>") + chalk.dim(" .......... ") + "Use specific Ollama model"
  );
  console.log(
    "  " + chalk.cyan("/clear") + chalk.dim(" ........................ ") + "Clear conversation history"
  );
  console.log(
    "  " + chalk.cyan("/status") + chalk.dim(" ....................... ") + "Show current config & status"
  );
  console.log(
    "  " + chalk.cyan("/compact") + chalk.dim(" ...................... ") + "Summarize & compress history"
  );
  console.log(
    "  " + chalk.cyan("/exit") + chalk.dim("  ........................ ") + "Exit"
  );
  console.log();
  console.log(chalk.bold.white("  Keyboard shortcuts"));
  console.log();
  console.log("  " + chalk.cyan("Ctrl+C") + chalk.dim(" ........................ ") + "Cancel current request");
  console.log("  " + chalk.cyan("Ctrl+D") + chalk.dim(" ........................ ") + "Exit session");
  console.log();
}
