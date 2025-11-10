#!/bin/bash
# Test the update script directly without act (faster, no Docker needed)

set -e

PACKAGE=${1:-"neovim"}

case "$PACKAGE" in
  neovim)
    echo "Testing Neovim update script..."
    node scripts/github-package.js \
      --owner neovim \
      --repo neovim \
      --package-name neovim \
      --bins '[{"name":"nvim","path":"bin/nvim"}]' \
      --github-token "${GITHUB_TOKEN:-}" \
      --allow-download-checksum
    ;;
  lazygit)
    echo "Testing Lazygit update script..."
    node scripts/github-package.js \
      --owner jesseduffield \
      --repo lazygit \
      --package-name lazygit \
      --bins '[{"name":"lazygit","path":"lazygit"}]' \
      --github-token "${GITHUB_TOKEN:-}" \
      --allow-download-checksum
    ;;
  go)
    echo "Testing Go update script..."
    node scripts/go-package.js \
      --allow-download-checksum
    ;;
  *)
    echo "Usage: $0 [neovim|lazygit|go]"
    exit 1
    ;;
esac

echo ""
echo "✅ Script completed! Check packages/${PACKAGE}.yaml"
