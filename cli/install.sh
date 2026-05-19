#!/usr/bin/env bash
# code-ai installer
# Builds the CLI and makes it available as `code-ai` in your terminal

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"
WRAPPER="${INSTALL_DIR}/code-ai"

echo ""
echo "  Installing code-ai CLI..."
echo ""

# Build the CLI
echo "  Building..."
cd "${SCRIPT_DIR}"
node --input-type=module < build.mjs

# Ensure ~/.local/bin exists
mkdir -p "${INSTALL_DIR}"

# Write a wrapper script
DIST_PATH="${SCRIPT_DIR}/dist/index.js"
cat > "${WRAPPER}" << WRAPPER_EOF
#!/usr/bin/env bash
exec node --enable-source-maps "${DIST_PATH}" "\$@"
WRAPPER_EOF

chmod +x "${WRAPPER}"

echo "  ✓ Installed to ${WRAPPER}"
echo ""

# Check if ~/.local/bin is on PATH
if echo "${PATH}" | grep -q "${INSTALL_DIR}"; then
  echo "  Run it with: code-ai"
else
  echo "  Add ~/.local/bin to your PATH:"
  echo ""
  echo "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
  echo "    source ~/.bashrc"
  echo ""
  echo "  Then run: code-ai"
fi
echo ""

# Prompt to run setup
if [ ! -f "${HOME}/.config/code-ai/config.json" ]; then
  echo "  No config found. Run the setup wizard next:"
  echo ""
  echo "    code-ai --setup"
  echo ""
  echo "  Or just run code-ai — setup runs automatically on first launch."
  echo ""
fi
