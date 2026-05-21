import chalk from "chalk";
import { spawn } from "child_process";
import { configExists } from "./config.js";
import { runSetup } from "./setup.js";
import { runRepl } from "./repl.js";
import { printBanner } from "./ui/banner.js";
import { loadConfig } from "./config.js";

const args = process.argv.slice(2);
const isSetup = args.includes("--setup") || args.includes("-s");
const isHelp = args.includes("--help") || args.includes("-h");
const isVersion = args.includes("--version") || args.includes("-v");

declare const __APP_VERSION__: string;

if (isVersion) {
  console.log(`nexus ${__APP_VERSION__}`);
  process.exit(0);
}

if (isHelp) {
  console.log(`
${chalk.bold.cyan("nexus")} — AI Coding Assistant

${chalk.bold("Usage:")}
  nexus              Start interactive session
  nexus --setup      Configure provider and API keys
  nexus --version    Show version
  nexus --help       Show this help

${chalk.bold("Providers:")}
  Cerebras AI    Fast online inference (llama3.3-70b and more)
  Ollama         Local private inference (any installed model)

${chalk.bold("In-session commands:")}
  /help          Show available commands
  /model         Switch provider or model
  /clear         Clear conversation history
  /status        Show current configuration
  /exit          Exit the session

${chalk.bold("Config location:")}
  ~/.config/nexus/config.json
`);
  process.exit(0);
}

async function ensureOllama(baseUrl: string): Promise<void> {
  // Check if already reachable
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return;
  } catch {}

  // Only try to auto-start if pointing at localhost
  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
  if (!isLocal) return;

  // Check if ollama binary exists
  const { execSync } = await import("child_process");
  try {
    execSync("which ollama", { stdio: "ignore" });
  } catch {
    return; // Not installed, let the first request fail with a clear error
  }

  process.stdout.write(chalk.dim("  Starting Ollama..."));
  const proc = spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
  });
  proc.unref();

  // Wait up to 10 s for it to become ready
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        process.stdout.write(" " + chalk.green("ready\n"));
        return;
      }
    } catch {}
    process.stdout.write(".");
  }
  process.stdout.write("\n");
}

async function main() {
  if (isSetup) {
    await runSetup(false);
    return;
  }

  if (!configExists()) {
    console.log();
    console.log(
      chalk.bold.cyan("  Welcome to nexus!") +
        chalk.dim(" First-time setup required.")
    );
    await runSetup(true);
    console.log();
  }

  const config = loadConfig();

  if (config.provider === "ollama") {
    await ensureOllama(config.ollamaBaseUrl);
  }

  printBanner(config);
  await runRepl();
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
