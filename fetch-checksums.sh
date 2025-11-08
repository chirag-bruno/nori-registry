#!/bin/bash
# Script to fetch SHA256 checksums for neovim releases
# Usage: ./fetch-checksums.sh v0.10.0 linux-amd64

VERSION=$1
PLATFORM=$2

case $PLATFORM in
  linux-amd64)
    FILE="nvim-linux-x86_64.tar.gz"
    ;;
  linux-arm64)
    FILE="nvim-linux-aarch64.tar.gz"
    ;;
  darwin-amd64)
    FILE="nvim-macos-x86_64.tar.gz"
    ;;
  darwin-arm64)
    FILE="nvim-macos-arm64.tar.gz"
    ;;
  windows-amd64)
    FILE="nvim-win64.zip"
    ;;
  *)
    echo "Unknown platform: $PLATFORM"
    exit 1
    ;;
esac

URL="https://github.com/neovim/neovim/releases/download/${VERSION}/${FILE}"

echo "Fetching checksum for ${VERSION} ${PLATFORM}..."
echo "URL: ${URL}"

# Download and compute SHA256
curl -sL "${URL}" | shasum -a 256 | awk '{print "sha256:" $1}'

