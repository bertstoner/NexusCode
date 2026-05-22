#!/usr/bin/env bash
# nexus installer
# Auto-installs all prerequisites (curl, git, Node.js 22, pnpm), then builds
# and installs nexus.
#
# Usage:
#   sudo ./install.sh          # system-wide  (/usr/local/bin)
#   ./install.sh               # current user (~/.local/bin)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT_HOOKS="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Git hooks — auto-chmod install.sh after every pull/checkout
# ---------------------------------------------------------------------------

install_git_hooks() {
  local hook_dir="${WORKSPACE_ROOT_HOOKS}/.git/hooks"
  [ -d "${hook_dir}" ] || return 0
  for hook in post-merge post-checkout; do
    cat > "${hook_dir}/${hook}" << 'HOOKEOF'
#!/bin/sh
chmod +x "$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)/cli/install.sh" 2>/dev/null || true
HOOKEOF
    chmod +x "${hook_dir}/${hook}"
  done
}
install_git_hooks

if [ "$(id -u)" = "0" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${HOME}/.local/bin"
fi
WRAPPER="${INSTALL_DIR}/nexus"

# Resolve the real user's home directory even when running under sudo
REAL_USER="${SUDO_USER:-${USER}}"
REAL_HOME="$(getent passwd "${REAL_USER}" 2>/dev/null | cut -d: -f6 || echo "${HOME}")"

echo ""
echo "  Installing nexus CLI..."
echo ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

detect_pkg_manager() {
  if   command -v apt-get >/dev/null 2>&1; then echo "apt"
  elif command -v dnf     >/dev/null 2>&1; then echo "dnf"
  elif command -v yum     >/dev/null 2>&1; then echo "yum"
  elif command -v zypper  >/dev/null 2>&1; then echo "zypper"
  elif command -v pacman  >/dev/null 2>&1; then echo "pacman"
  else echo "unknown"
  fi
}

# Prefix with sudo only when not already root
maybe_sudo() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo "$@"; fi
}

PKG_MGR="$(detect_pkg_manager)"

pkg_install() {
  # Usage: pkg_install <package> [<package> ...]
  case "${PKG_MGR}" in
    apt)    maybe_sudo apt-get install -y "$@" ;;
    dnf)    maybe_sudo dnf     install -y "$@" ;;
    yum)    maybe_sudo yum     install -y "$@" ;;
    zypper) maybe_sudo zypper  install -y "$@" ;;
    pacman) maybe_sudo pacman  -Sy --noconfirm "$@" ;;
    *)
      echo "  ERROR: Unsupported package manager. Install manually: $*"
      exit 1
      ;;
  esac
}

# ---------------------------------------------------------------------------
# curl  (needed by nodesource setup scripts)
# ---------------------------------------------------------------------------

if ! command -v curl >/dev/null 2>&1; then
  echo "  curl not found — installing..."
  pkg_install curl
fi
echo "  curl OK"

# ---------------------------------------------------------------------------
# git  (sanity-check — should already be present if repo was cloned)
# ---------------------------------------------------------------------------

if ! command -v git >/dev/null 2>&1; then
  echo "  git not found — installing..."
  pkg_install git
fi
echo "  git OK"

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------

install_node() {
  echo "  Node.js not found or too old — installing Node.js 22 LTS..."
  case "${PKG_MGR}" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_22.x | maybe_sudo bash -
      maybe_sudo apt-get install -y nodejs
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | maybe_sudo bash -
      maybe_sudo dnf install -y nodejs
      ;;
    yum)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | maybe_sudo bash -
      maybe_sudo yum install -y nodejs
      ;;
    zypper)
      maybe_sudo zypper install -y nodejs22 npm22
      ;;
    pacman)
      maybe_sudo pacman -Sy --noconfirm nodejs npm
      ;;
    *)
      echo "  ERROR: Cannot auto-install Node.js — unsupported package manager."
      echo "  Install Node.js 22 LTS manually: https://nodejs.org/en/download"
      exit 1
      ;;
  esac
}

# Resolve binary
if   command -v node   >/dev/null 2>&1; then NODE_BIN="node"
elif command -v nodejs >/dev/null 2>&1; then NODE_BIN="nodejs"
else
  install_node
  if   command -v node   >/dev/null 2>&1; then NODE_BIN="node"
  elif command -v nodejs >/dev/null 2>&1; then NODE_BIN="nodejs"
  else
    echo "  ERROR: Node.js installation did not succeed."
    exit 1
  fi
fi

# Version check — upgrade if < 22 (pnpm 11 requires Node.js >= 22.13)
NODE_MAJOR="$("${NODE_BIN}" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "  Node.js $("${NODE_BIN}" --version) is too old (need >= 22) — upgrading..."
  install_node
  if   command -v node   >/dev/null 2>&1; then NODE_BIN="node"
  elif command -v nodejs >/dev/null 2>&1; then NODE_BIN="nodejs"
  fi
  NODE_MAJOR="$("${NODE_BIN}" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
  if [ "${NODE_MAJOR}" -lt 22 ]; then
    echo "  ERROR: Upgrade failed. Install Node.js 22+ manually: https://nodejs.org/en/download"
    exit 1
  fi
fi
echo "  Node.js $("${NODE_BIN}" --version) OK"

# ---------------------------------------------------------------------------
# pnpm
# ---------------------------------------------------------------------------

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm not found — installing..."
  npm install -g pnpm
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  ERROR: pnpm installation did not succeed."
  exit 1
fi
echo "  pnpm v$(pnpm --version) OK"
echo ""

# ---------------------------------------------------------------------------
# NVIDIA Container Toolkit  (GPU passthrough for Ollama)
# ---------------------------------------------------------------------------

NVIDIA_TOOLKIT_INSTALLED=0

if command -v nvidia-smi >/dev/null 2>&1; then
  echo "  NVIDIA GPU detected — ensuring nvidia-container-toolkit is installed..."

  if ! command -v nvidia-ctk >/dev/null 2>&1; then
    case "${PKG_MGR}" in
      apt)
        # Official NVIDIA repo for Debian/Ubuntu
        KEYRING="/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
          | maybe_sudo gpg --dearmor -o "${KEYRING}"
        curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
          | sed "s#deb https://#deb [signed-by=${KEYRING}] https://#g" \
          | maybe_sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
        maybe_sudo apt-get update -qq
        maybe_sudo apt-get install -y nvidia-container-toolkit
        ;;
      dnf|yum)
        curl -fsSL https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
          | maybe_sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo >/dev/null
        maybe_sudo "${PKG_MGR}" install -y nvidia-container-toolkit
        ;;
      *)
        echo "  WARNING: Cannot auto-install nvidia-container-toolkit on this distro."
        echo "           Install manually: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
        ;;
    esac
  fi

  if command -v nvidia-ctk >/dev/null 2>&1; then
    # Configure Docker runtime and restart so --gpus flags work
    maybe_sudo nvidia-ctk runtime configure --runtime=docker 2>/dev/null
    NVIDIA_TOOLKIT_INSTALLED=1
    echo "  nvidia-container-toolkit OK — GPU will be available in containers"
  fi
else
  echo "  No NVIDIA GPU detected — skipping nvidia-container-toolkit"
fi
echo ""

# ---------------------------------------------------------------------------
# Docker  (used for Ollama + Open WebUI containers)
# ---------------------------------------------------------------------------

WORKSPACE_ROOT_EARLY="$(cd "${SCRIPT_DIR}/.." && pwd)"

install_docker() {
  echo "  Docker not found — installing..."
  curl -fsSL https://get.docker.com | maybe_sudo sh
  # Add current user to docker group so we don't need sudo for every command
  if [ "$(id -u)" != "0" ]; then
    maybe_sudo usermod -aG docker "${USER}" 2>/dev/null || true
    echo "  NOTE: You may need to log out and back in for docker group membership to take effect."
    echo "        If docker commands fail, run: newgrp docker"
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  install_docker
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "  ERROR: Docker installation did not succeed."
  exit 1
fi

# Ensure Docker daemon is running (restart if nvidia-ctk just configured it)
if [ "${NVIDIA_TOOLKIT_INSTALLED}" = "1" ] || ! docker info >/dev/null 2>&1; then
  if command -v systemctl >/dev/null 2>&1; then
    maybe_sudo systemctl restart docker
  else
    maybe_sudo service docker restart 2>/dev/null || true
  fi
  sleep 3
fi

if ! docker info >/dev/null 2>&1; then
  echo "  WARNING: Docker daemon not responding — you may need to start it manually."
  echo "           Skipping container setup."
  SKIP_CONTAINERS=1
fi

echo "  Docker $(docker --version | awk '{print $3}' | tr -d ',') OK"

# Docker Compose (plugin or standalone)
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "  Docker Compose not found — installing plugin..."
  case "${PKG_MGR}" in
    apt) maybe_sudo apt-get install -y docker-compose-plugin ;;
    dnf) maybe_sudo dnf install -y docker-compose-plugin ;;
    yum) maybe_sudo yum install -y docker-compose-plugin ;;
    *)
      COMPOSE_VER="2.27.1"
      COMPOSE_BIN="/usr/local/lib/docker/cli-plugins/docker-compose"
      maybe_sudo mkdir -p "$(dirname ${COMPOSE_BIN})"
      maybe_sudo curl -fsSL \
        "https://github.com/docker/compose/releases/download/v${COMPOSE_VER}/docker-compose-$(uname -s)-$(uname -m)" \
        -o "${COMPOSE_BIN}"
      maybe_sudo chmod +x "${COMPOSE_BIN}"
      ;;
  esac
  COMPOSE_CMD="docker compose"
fi
echo "  Docker Compose OK"
echo ""

# ---------------------------------------------------------------------------
# Ollama + Open WebUI containers
# ---------------------------------------------------------------------------

ollama_pull_progress() {
  local model="$1"
  local last_status=""
  # Stream the pull API and render a progress bar from completed/total fields
  curl -sN -X POST http://localhost:11434/api/pull \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${model}\"}" | \
  while IFS= read -r line; do
    local status completed total pct filled empty filled_str empty_str
    status=$(printf '%s' "$line"   | grep -o '"status":"[^"]*"' | sed 's/"status":"//;s/"//')
    completed=$(printf '%s' "$line" | grep -o '"completed":[0-9]*' | grep -o '[0-9]*$')
    total=$(printf '%s' "$line"     | grep -o '"total":[0-9]*'     | grep -o '[0-9]*$')

    if [ -n "$total" ] && [ "$total" -gt 0 ] && [ -n "$completed" ]; then
      pct=$((completed * 100 / total))
      filled=$((pct / 2))
      empty=$((50 - filled))
      filled_str=$(printf '%*s' "$filled" '' | tr ' ' '#')
      empty_str=$(printf '%*s'  "$empty"  '' | tr ' ' '-')
      printf "\r  [%s%s] %3d%%  %s" "$filled_str" "$empty_str" "$pct" "$status"
    elif [ -n "$status" ] && [ "$status" != "$last_status" ]; then
      printf "\r  %-72s" "$status"
      last_status="$status"
    fi
  done
  printf "\n"
}

if [ "${SKIP_CONTAINERS}" != "1" ]; then
  cd "${WORKSPACE_ROOT_EARLY}"

  # Create .env from .env.example if it doesn't exist
  if [ ! -f .env ]; then
    cp .env.example .env
  fi

  # ── API key prompts ──────────────────────────────────────────────────────────

  # Read a secret character-by-character, printing * per keystroke.
  # All display goes to /dev/tty so it works inside subshells and under sudo.
  # Result is stored in global REPLY (never captured via $(...)).
  read_secret() {
    REPLY=""
    local char
    local tty=/dev/tty
    [ -e "${tty}" ] || { IFS= read -r REPLY; return; }
    stty -echo -icanon min 1 time 0 2>/dev/null || true
    while IFS= read -r -n1 char 2>/dev/null; do
      case "${char}" in
        $'\0'|$'\n'|$'\r') break ;;
        $'\177'|$'\b')
          if [ ${#REPLY} -gt 0 ]; then
            REPLY="${REPLY%?}"
            printf '\b \b' > "${tty}"
          fi
          ;;
        *) REPLY="${REPLY}${char}"; printf '*' > "${tty}" ;;
      esac
    done
    stty echo icanon 2>/dev/null || true
    printf '\n' > "${tty}"
  }

  # Prompt for a secret key, write to .env, set REPLY.
  prompt_secret() {
    local label="$1" var="$2" existing
    existing="$(grep "^${var}=" .env 2>/dev/null | cut -d'=' -f2-)"
    if [ -n "${existing}" ]; then
      printf "  %s [keep existing]: " "${label}" > /dev/tty
    else
      printf "  %s (optional — press Enter to skip): " "${label}" > /dev/tty
    fi
    read_secret                          # sets REPLY
    REPLY="${REPLY:-${existing}}"
    if [ -n "${REPLY}" ]; then
      grep -v "^${var}=" .env > /tmp/.env.nexus.tmp && mv /tmp/.env.nexus.tmp .env
      printf '%s=%s\n' "${var}" "${REPLY}" >> .env
    fi
  }

  echo ""
  echo "  ── API Keys (used by nexus CLI and Open WebUI) ────────────────────"
  echo ""
  echo "  Cerebras AI gives fast cloud inference as an alternative to Ollama."
  echo "  Get a free key at: https://cloud.cerebras.ai"
  echo ""
  prompt_secret "Cerebras API key" "CEREBRAS_API_KEY"
  CEREBRAS_KEY="${REPLY}"
  echo ""
  echo "  Tavily enables web search inside both the CLI and Open WebUI."
  echo "  Get a free key at: https://app.tavily.com"
  echo ""
  prompt_secret "Tavily API key  " "TAVILY_API_KEY"
  TAVILY_KEY="${REPLY}"
  echo ""

  # ── Start containers ─────────────────────────────────────────────────────────

  echo "  Starting Ollama + Open WebUI containers..."
  ${COMPOSE_CMD} --profile cli up -d ollama open-webui

  # Wait up to 120 s for Ollama API to be ready
  printf "  Waiting for Ollama to be ready..."
  OLLAMA_READY=0
  for i in $(seq 1 120); do
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
      OLLAMA_READY=1
      break
    fi
    sleep 1
    case $((i % 4)) in
      0) printf "\r  Waiting for Ollama to be ready... |" ;;
      1) printf "\r  Waiting for Ollama to be ready... /" ;;
      2) printf "\r  Waiting for Ollama to be ready... -" ;;
      3) printf "\r  Waiting for Ollama to be ready... \\" ;;
    esac
  done
  printf "\r  %-50s\n" "  Waiting for Ollama to be ready... done"

  if [ "${OLLAMA_READY}" != "1" ]; then
    echo "  WARNING: Ollama did not become ready in time."
    echo "           Check logs with: docker compose --profile cli logs ollama"
  else
    # Pull default model if not already present
    DEFAULT_MODEL="$(grep "^OLLAMA_MODEL=" .env 2>/dev/null | cut -d'=' -f2-)"
    DEFAULT_MODEL="${DEFAULT_MODEL:-llama3.1}"
    if ! curl -sf http://localhost:11434/api/tags | grep -q "${DEFAULT_MODEL}" 2>/dev/null; then
      echo "  Pulling ${DEFAULT_MODEL}..."
      ollama_pull_progress "${DEFAULT_MODEL}"
      echo "  ${DEFAULT_MODEL} ready"
    fi

    # Sync nexus CLI config — model + API keys — from .env
    NEXUS_CONFIG="${REAL_HOME}/.config/nexus/config.json"
    mkdir -p "$(dirname "${NEXUS_CONFIG}")"
    # Read current keys from .env in case they were set on a previous run
    CEREBRAS_KEY="${CEREBRAS_KEY:-$(grep "^CEREBRAS_API_KEY=" .env 2>/dev/null | cut -d'=' -f2-)}"
    TAVILY_KEY="${TAVILY_KEY:-$(grep "^TAVILY_API_KEY=" .env 2>/dev/null | cut -d'=' -f2-)}"
    # Pass all values as env vars so special characters in keys can't break the script
    NEXUS_CONFIG="${NEXUS_CONFIG}" \
    NEXUS_MODEL="${DEFAULT_MODEL}" \
    NEXUS_CEREBRAS_KEY="${CEREBRAS_KEY}" \
    NEXUS_TAVILY_KEY="${TAVILY_KEY}" \
    node -e "
      const fs = require('fs');
      const { NEXUS_CONFIG, NEXUS_MODEL, NEXUS_CEREBRAS_KEY, NEXUS_TAVILY_KEY } = process.env;
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(NEXUS_CONFIG, 'utf8')); } catch {}
      cfg.provider      = cfg.provider || 'ollama';
      cfg.ollamaBaseUrl = cfg.ollamaBaseUrl || 'http://localhost:11434';
      cfg.ollamaModel   = NEXUS_MODEL;
      cfg.cerebrasModel = cfg.cerebrasModel || 'llama3.3-70b';
      cfg.maxTokens     = cfg.maxTokens || 8192;
      cfg.temperature   = cfg.temperature || 0.2;
      if (NEXUS_CEREBRAS_KEY) cfg.cerebrasApiKey = NEXUS_CEREBRAS_KEY;
      if (NEXUS_TAVILY_KEY)   cfg.tavilyApiKey   = NEXUS_TAVILY_KEY;
      fs.mkdirSync(require('path').dirname(NEXUS_CONFIG), { recursive: true });
      fs.writeFileSync(NEXUS_CONFIG, JSON.stringify(cfg, null, 2));
    " && echo "  nexus CLI config synced (model: ${DEFAULT_MODEL})"
    # Verify GPU is visible inside the Ollama container
    OLLAMA_CONTAINER="$(${COMPOSE_CMD} --profile cli ps -q ollama 2>/dev/null | head -1)"
    if [ -n "${OLLAMA_CONTAINER}" ] && docker exec "${OLLAMA_CONTAINER}" nvidia-smi >/dev/null 2>&1; then
      GPU_NAME="$(docker exec "${OLLAMA_CONTAINER}" nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
      echo "  GPU in container: ${GPU_NAME:-detected}"
    elif command -v nvidia-smi >/dev/null 2>&1; then
      echo "  WARNING: NVIDIA GPU present on host but not visible in Ollama container."
      echo "           Ensure nvidia-container-toolkit is installed and Docker was restarted."
    fi
    echo "  Ollama OK  →  http://localhost:11434"
    echo "  Open WebUI →  http://localhost:3000  (also accessible from other machines)"
  fi

  cd "${SCRIPT_DIR}"
  echo ""
fi

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------

echo "  Installing dependencies..."
# Run from workspace root so pnpm resolves the lockfile and workspace correctly
cd "${WORKSPACE_ROOT_EARLY}"
pnpm install --frozen-lockfile --ignore-scripts
cd "${SCRIPT_DIR}"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

echo "  Building..."
"${NODE_BIN}" build.mjs

# ---------------------------------------------------------------------------
# Install wrapper
# ---------------------------------------------------------------------------

mkdir -p "${INSTALL_DIR}"

DIST_PATH="${SCRIPT_DIR}/dist/index.js"
cat > "${WRAPPER}" << WRAPPER_EOF
#!/usr/bin/env bash
exec "${NODE_BIN}" --enable-source-maps "${DIST_PATH}" "\$@"
WRAPPER_EOF

chmod +x "${WRAPPER}"

echo ""
echo "  ✓ Installed to ${WRAPPER}"
echo ""

# ---------------------------------------------------------------------------
# PATH hint
# ---------------------------------------------------------------------------

if echo "${PATH}" | grep -q "${INSTALL_DIR}"; then
  echo "  Run it with: nexus"
elif [ "${INSTALL_DIR}" = "/usr/local/bin" ]; then
  echo "  Run it with: nexus"
else
  echo "  Add ~/.local/bin to your PATH:"
  echo ""
  echo "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
  echo "    source ~/.bashrc"
  echo ""
  echo "  Then run: nexus"
fi
echo ""

# ---------------------------------------------------------------------------
# First-run hint
# ---------------------------------------------------------------------------

if [ ! -f "${HOME}/.config/nexus/config.json" ]; then
  echo "  No config found. Run the setup wizard next:"
  echo ""
  echo "    nexus --setup"
  echo ""
  echo "  Or just run nexus — setup runs automatically on first launch."
  echo ""
fi
