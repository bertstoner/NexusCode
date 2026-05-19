# code-ai

A Claude Code-style AI coding assistant for your terminal. Supports **Cerebras AI** (fast online inference) and **Ollama** (local private models).

## Quick Start

```bash
# Install globally
bash cli/install.sh

# Or run directly
node cli/dist/index.mjs
```

## Features

- **Claude Code-style interface** — interactive REPL with tool calling
- **Full filesystem access** — read, write, edit files, run bash commands
- **Cerebras AI** — fast online inference (llama-3.3-70b, llama-3.1-8b)
- **Ollama** — local private models (llama3.1, mistral, codellama, etc.)
- **Web search** — Tavily-powered real-time search (optional)
- **First-run setup** — prompts for API keys on first launch

## Tools available to the AI

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with optional line range |
| `write_file` | Create or overwrite files |
| `edit_file` | Targeted find-and-replace edits |
| `list_directory` | Explore directory tree |
| `glob` | Find files by pattern |
| `bash` | Execute shell commands |
| `web_search` | Tavily web search (if configured) |

## In-session commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model cerebras` | Switch to Cerebras AI |
| `/model ollama` | Switch to Ollama (local) |
| `/model ollama llama3.1` | Use a specific Ollama model |
| `/clear` | Clear conversation history |
| `/status` | Show current config and provider |
| `/exit` | Exit the session |

## Configuration

Config is stored at `~/.config/code-ai/config.json`.

Re-run setup anytime:
```bash
code-ai --setup
```

### Cerebras AI
Sign up at https://cloud.cerebras.ai for an API key.

### Ollama (local)
Install from https://ollama.ai, then pull a model:
```bash
ollama pull llama3.1
ollama pull codellama
ollama pull mistral
```

### Tavily (web search)
Optional. Get an API key at https://app.tavily.com.

## Development

```bash
# Run in dev mode (no build needed)
pnpm --filter @workspace/cli run dev

# Build
pnpm --filter @workspace/cli run build

# Typecheck
pnpm --filter @workspace/cli run typecheck
```
