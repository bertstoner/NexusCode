#!/usr/bin/env bash
set -e

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1}"

# Wait for Ollama to be ready (up to 60 s)
echo "  Waiting for Ollama at ${OLLAMA_BASE_URL}..."
for i in $(seq 1 60); do
  if curl -sf "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "  ERROR: Ollama did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done
echo "  Ollama ready."

# Pull model if not already present
if ! curl -sf "${OLLAMA_BASE_URL}/api/tags" | grep -q "\"${OLLAMA_MODEL}\""; then
  echo "  Pulling ${OLLAMA_MODEL} (this may take a while)..."
  curl -s -X POST "${OLLAMA_BASE_URL}/api/pull" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${OLLAMA_MODEL}\"}" \
  | while IFS= read -r line; do
      status=$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
      [ -n "$status" ] && printf "\r  %s                    " "$status"
    done
  echo ""
  echo "  Model ready."
fi

# Write default config if none exists — points at the compose Ollama service
CONFIG_FILE="${HOME}/.config/code-ai/config.json"
if [ ! -f "${CONFIG_FILE}" ]; then
  mkdir -p "$(dirname "${CONFIG_FILE}")"
  cat > "${CONFIG_FILE}" <<EOF
{
  "provider": "ollama",
  "ollamaBaseUrl": "${OLLAMA_BASE_URL}",
  "ollamaModel": "${OLLAMA_MODEL}",
  "cerebrasModel": "llama-3.3-70b",
  "maxTokens": 8192,
  "temperature": 0.2
}
EOF
  echo "  Config initialized for Ollama at ${OLLAMA_BASE_URL}."
fi

exec node --enable-source-maps /app/cli/dist/index.js "$@"
