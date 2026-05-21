import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface Config {
  provider: "cerebras" | "ollama";
  cerebrasApiKey?: string;
  tavilyApiKey?: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  cerebrasModel: string;
  maxTokens: number;
  temperature: number;
}

const CONFIG_DIR = join(homedir(), ".config", "nexus");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULTS: Config = {
  provider: "cerebras",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  cerebrasModel: "llama3.3-70b",
  maxTokens: 8192,
  temperature: 0.2,
};

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Warning: could not parse config file (${msg}), using defaults.\n`);
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: Partial<Config>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
