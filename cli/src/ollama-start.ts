import { spawn } from "child_process";
import chalk from "chalk";

export async function ensureOllama(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return;
  } catch {}

  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
  if (!isLocal) return;

  const { execSync } = await import("child_process");
  const whichCmd = process.platform === "win32" ? "where ollama" : "which ollama";
  try {
    execSync(whichCmd, { stdio: "ignore" });
  } catch {
    return;
  }

  process.stdout.write(chalk.dim("  Starting Ollama..."));
  const proc = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
  proc.unref();

  for (let i = 0; i < 15; i++) {
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
