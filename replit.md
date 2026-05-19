# code-ai

A Claude Code-style AI coding assistant CLI — run locally with Ollama models or online via Cerebras AI, with full filesystem access, tool calling, and optional Tavily web search.

## Run & Operate

- `node cli/dist/index.js` — run the CLI directly
- `node cli/dist/index.js --setup` — re-run configuration wizard
- `node cli/dist/index.js --help` — show usage
- `bash cli/install.sh` — build and install `code-ai` to `~/.local/bin/`
- `pnpm --filter @workspace/cli run build` — rebuild the CLI
- `pnpm --filter @workspace/cli run typecheck` — typecheck the CLI source

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- CLI: Node.js readline REPL + esbuild (CJS bundle)
- LLM providers: Cerebras AI (OpenAI-compatible) + Ollama (local)
- Web search: Tavily API
- Tools: filesystem (read/write/edit/glob/list) + bash execution

## Where things live

- `cli/src/index.ts` — CLI entry point, setup detection
- `cli/src/setup.ts` — first-run setup wizard (API key prompts)
- `cli/src/config.ts` — config management (`~/.config/code-ai/config.json`)
- `cli/src/repl.ts` — main interactive REPL loop
- `cli/src/llm/` — LLM provider adapters (Ollama + Cerebras)
- `cli/src/tools/` — tool implementations (fs, bash, search)
- `cli/src/ui/` — terminal rendering (banner, colors, tool display)
- `cli/dist/index.js` — built CLI binary

## Architecture decisions

- CJS output via esbuild so fast-glob and other CJS deps resolve correctly
- External deps (chalk, ora, fast-glob) left unbundled so they load from node_modules
- Config stored in `~/.config/code-ai/config.json` — persists across sessions
- Streaming responses from both providers, with per-token rendering
- Tool calling loop capped at 20 rounds to prevent runaway chains
- Dangerous bash patterns (rm -rf /, :(){}, etc.) are blocked at tool execution time

## Product

A terminal-based AI coding assistant that:
- Provides a Claude Code-like interactive REPL in the terminal
- Supports Cerebras AI (online, fast) and Ollama (local, private) as LLM backends
- Gives the AI full access to the filesystem and shell via tool calling
- Prompts for Cerebras and Tavily API keys on first run
- Supports switching models mid-session with `/model` command

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/cli run build` after any source changes before running dist
- `fast-glob`, `chalk`, `ora`, `marked` are kept external (not bundled) — they must be in node_modules
- Ollama must be running locally at `http://localhost:11434` for local mode to work
- The `code-ai` bin is installed to `~/.local/bin/` — add that to PATH if not already there

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
