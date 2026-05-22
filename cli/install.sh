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

if [ "$(id -u)" = "0" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${HOME}/.local/bin"
fi
WRAPPER="${INSTALL_DIR}/nexus"

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

# Version check — upgrade if < 20
NODE_MAJOR="$("${NODE_BIN}" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "  Node.js $("${NODE_BIN}" --version) is too old (need >= 20) — upgrading..."
  install_node
  if   command -v node   >/dev/null 2>&1; then NODE_BIN="node"
  elif command -v nodejs >/dev/null 2>&1; then NODE_BIN="nodejs"
  fi
  NODE_MAJOR="$("${NODE_BIN}" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
  if [ "${NODE_MAJOR}" -lt 20 ]; then
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

# Ensure Docker daemon is running
if ! docker info >/dev/null 2>&1; then
  echo "  Starting Docker daemon..."
  if command -v systemctl >/dev/null 2>&1; then
    maybe_sudo systemctl enable --now docker
  else
    maybe_sudo service docker start 2>/dev/null || true
  fi
  sleep 3
  if ! docker info >/dev/null 2>&1; then
    echo "  WARNING: Docker daemon not responding — you may need to start it manually."
    echo "           Skipping container setup."
    SKIP_CONTAINERS=1
  fi
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

if [ "${SKIP_CONTAINERS}" != "1" ]; then
  echo "  Starting Ollama + Open WebUI containers..."
  cd "${WORKSPACE_ROOT_EARLY}"

  # Create .env from .env.example if it doesn't exist
  if [ ! -f .env ]; then
    cp .env.example .env
    echo "  Created .env from .env.example"
  fi

  # Bring up just the cli profile (Ollama + Open WebUI) in detached mode
  ${COMPOSE_CMD} --profile cli up -d ollama open-webui

  # Wait up to 60 s for Ollama API to be ready
  echo "  Waiting for Ollama to be ready..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
      break
    fi
    sleep 1
    printf "."
  done
  echo ""

  if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "  WARNING: Ollama did not become ready in time."
    echo "           Check logs with: docker compose --profile cli logs ollama"
  else
    # Pull default model if not already present
    DEFAULT_MODEL="llama3.1"
    if ! curl -sf http://localhost:11434/api/tags | grep -q "${DEFAULT_MODEL}" 2>/dev/null; then
      echo "  Pulling ${DEFAULT_MODEL} (this may take a while)..."
      docker exec "$(${COMPOSE_CMD} ps -q ollama 2>/dev/null | head -1)" \
        ollama pull "${DEFAULT_MODEL}" 2>/dev/null || \
        curl -sf -X POST http://localhost:11434/api/pull \
          -d "{\"name\":\"${DEFAULT_MODEL}\"}" >/dev/null
      echo "  ${DEFAULT_MODEL} ready"
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
