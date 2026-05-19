import { execSync } from "child_process";
import type { ToolDefinition } from "./fs.js";

export const bashToolDefinition: ToolDefinition = {
  name: "bash",
  description:
    "Execute a shell command and return its output. Use this for running tests, installing packages, checking git status, building projects, and other terminal operations. Commands run in the current working directory. Avoid interactive commands or long-running processes.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000, max: 120000)",
      },
    },
    required: ["command"],
  },
};

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[/~]/,
  /:\(\)\{.*\}/,
  /dd\s+if=/,
  /mkfs/,
  /format\s+[a-z]:/i,
  /shutdown/,
  /reboot/,
  /halt/,
];

export function executeBash(
  command: string,
  timeoutMs: number = 30000
): string {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command rejected for safety: matches dangerous pattern`);
    }
  }

  const effectiveTimeout = Math.min(timeoutMs, 120000);

  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: effectiveTimeout,
      maxBuffer: 10 * 1024 * 1024,
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim() || "(no output)";
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const stdout = error.stdout?.trim() ?? "";
    const stderr = error.stderr?.trim() ?? "";
    const combined = [stdout, stderr].filter(Boolean).join("\n");
    if (combined) return `Error:\n${combined}`;
    throw new Error(error.message ?? "Command failed");
  }
}
