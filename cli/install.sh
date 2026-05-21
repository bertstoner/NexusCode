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
# Ollama
# ---------------------------------------------------------------------------

if ! command -v ollama >/dev/null 2>&1; then
  echo "  Ollama not found — installing..."
  curl -fsSL https://ollama.ai/install.sh | sh
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "  ERROR: Ollama installation did not succeed."
  exit 1
fi
echo "  ollama $(ollama --version 2>/dev/null || echo 'OK')"

# Detect Docker / container environment (no systemd init)
in_container() {
  [ -f /.dockerenv ] || grep -qa 'docker\|lxc\|containerd' /proc/1/cgroup 2>/dev/null
}

# Start Ollama if not already running
if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "  Starting Ollama..."
  if ! in_container && command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q ollama; then
    maybe_sudo systemctl enable --now ollama
  else
    # Docker / no-systemd: run in background, log to /tmp
    ollama serve > /tmp/ollama.log 2>&1 &
    OLLAMA_PID=$!
    echo "  Ollama started in background (pid ${OLLAMA_PID}, log: /tmp/ollama.log)"
    # Wait up to 30 s for the API to become ready
    echo "  Waiting for Ollama API..."
    for i in $(seq 1 30); do
      if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
        break
      fi
      if ! kill -0 "${OLLAMA_PID}" 2>/dev/null; then
        echo "  ERROR: Ollama process exited unexpectedly. Check /tmp/ollama.log"
        exit 1
      fi
      sleep 1
    done
    if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
      echo "  ERROR: Ollama API did not become ready. Check /tmp/ollama.log"
      exit 1
    fi
  fi
fi

# Pull default model if not already present
DEFAULT_MODEL="llama3.1"
if ! ollama list 2>/dev/null | grep -q "${DEFAULT_MODEL}"; then
  echo "  Pulling ${DEFAULT_MODEL} (this may take a while)..."
  ollama pull "${DEFAULT_MODEL}"
fi
echo "  Ollama + ${DEFAULT_MODEL} OK"
echo ""

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------

echo "  Installing dependencies..."
# Run from workspace root so pnpm resolves the lockfile and workspace correctly
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${WORKSPACE_ROOT}"
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
