#!/bin/bash
# Fetch checksums from GitHub's .sha256sum files for neovim releases

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Usage: ./fetch-neovim-checksums.sh <version>"
    exit 1
fi

echo "Fetching checksums for neovim v${VERSION}..."

# Linux - check if linux64 or separate arch files exist
LINUX_AMD64_URL="https://github.com/neovim/neovim/releases/download/v${VERSION}/nvim-linux64.tar.gz.sha256sum"
LINUX_ARM64_URL="https://github.com/neovim/neovim/releases/download/v${VERSION}/nvim-linux-aarch64.tar.gz.sha256sum"

# macOS
MACOS_AMD64_URL="https://github.com/neovim/neovim/releases/download/v${VERSION}/nvim-macos-x86_64.tar.gz.sha256sum"
MACOS_ARM64_URL="https://github.com/neovim/neovim/releases/download/v${VERSION}/nvim-macos-arm64.tar.gz.sha256sum"

# Windows
WIN64_URL="https://github.com/neovim/neovim/releases/download/v${VERSION}/nvim-win64.zip.sha256sum"

fetch_checksum() {
    local url=$1
    local checksum=$(curl -sL "$url" 2>/dev/null | awk '{print $1}')
    if [ -n "$checksum" ] && [ ${#checksum} -eq 64 ]; then
        echo "sha256:${checksum}"
    else
        echo ""
    fi
}

echo "linux-amd64: $(fetch_checksum "$LINUX_AMD64_URL")"
echo "linux-arm64: $(fetch_checksum "$LINUX_ARM64_URL")"
echo "darwin-amd64: $(fetch_checksum "$MACOS_AMD64_URL")"
echo "darwin-arm64: $(fetch_checksum "$MACOS_ARM64_URL")"
echo "windows-amd64: $(fetch_checksum "$WIN64_URL")"

