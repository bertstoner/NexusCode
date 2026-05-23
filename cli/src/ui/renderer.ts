import chalk from "chalk";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  output: string;
  error?: boolean;
}

export function renderUserMessage(msg: string): void {
  console.log();
  console.log(chalk.bold.white("  You") + chalk.dim(" ─────────────────────────────────"));
  const lines = msg.split("\n");
  for (const line of lines) {
    console.log("  " + chalk.white(line));
  }
  console.log();
}

export function renderAssistantPrefix(): void {
  console.log(chalk.bold.cyan("  Assistant") + chalk.dim(" ──────────────────────────────"));
  process.stdout.write("  ");
}

export function renderAssistantToken(token: string): void {
  process.stdout.write(token);
}

export function renderAssistantEnd(): void {
  process.stdout.write("\n\n");
}

const trunc = (s: string, n = 60): string => s.length > n ? s.slice(0, n) + "…" : s;

export function renderToolCall(tool: ToolCall): void {
  const icons: Record<string, string> = {
    read_file: "📖",
    write_file: "✏️ ",
    edit_file: "🔧",
    list_directory: "📂",
    bash: "⚡",
    web_search: "🔍",
    glob: "🔎",
  };
  const icon = icons[tool.name] ?? "🔧";
  let summary = "";
  if (tool.name === "read_file") {
    summary = chalk.dim(trunc((tool.input.path as string) ?? ""));
  } else if (tool.name === "write_file") {
    summary = chalk.dim(trunc((tool.input.path as string) ?? ""));
  } else if (tool.name === "edit_file") {
    summary = chalk.dim(trunc((tool.input.path as string) ?? ""));
  } else if (tool.name === "list_directory") {
    summary = chalk.dim(trunc((tool.input.path as string) ?? "."));
  } else if (tool.name === "bash") {
    const cmd = (tool.input.command as string) ?? "";
    summary = chalk.dim(trunc(cmd));
  } else if (tool.name === "web_search") {
    summary = chalk.dim(trunc((tool.input.query as string) ?? ""));
  } else if (tool.name === "glob") {
    summary = chalk.dim(trunc((tool.input.pattern as string) ?? ""));
  }
  console.log(
    "  " +
      chalk.dim("⎡ ") +
      icon +
      " " +
      chalk.bold(toolDisplayName(tool.name)) +
      " " +
      summary
  );
}

export function renderToolResult(result: ToolResult): void {
  if (result.error) {
    const lines = result.output.split("\n").slice(0, 8);
    for (const line of lines) {
      console.log("  " + chalk.dim("⎢ ") + chalk.red(line));
    }
  } else {
    const lines = result.output.split("\n");
    const preview = lines.slice(0, 6);
    for (const line of preview) {
      const display = line.length > 120 ? line.slice(0, 120) + "…" : line;
      console.log("  " + chalk.dim("⎢ ") + chalk.dim(display));
    }
    if (lines.length > 6) {
      console.log(
        "  " + chalk.dim(`⎢ … ${lines.length - 6} more lines`)
      );
    }
  }
  console.log("  " + chalk.dim("⎦"));
}

export function renderError(msg: string): void {
  console.log();
  console.log("  " + chalk.red("✗ ") + chalk.red(msg));
  console.log();
}

export function renderInfo(msg: string): void {
  console.log("  " + chalk.dim(msg));
}

export function renderSuccess(msg: string): void {
  console.log("  " + chalk.green("✓ ") + chalk.white(msg));
}

function toolDisplayName(name: string): string {
  const names: Record<string, string> = {
    read_file: "Read",
    write_file: "Write",
    edit_file: "Edit",
    list_directory: "List",
    bash: "Bash",
    web_search: "Search",
    glob: "Glob",
  };
  return names[name] ?? name;
}

export function renderThinking(): NodeJS.Timeout {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stdout.write("  ");
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${chalk.cyan(frames[i % frames.length])} ${chalk.dim("Thinking…")}`);
    i++;
  }, 80);
  return interval;
}

export function clearThinking(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  process.stdout.write("\r" + " ".repeat(40) + "\r");
}
