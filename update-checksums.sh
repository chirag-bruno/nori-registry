#!/bin/bash
# Script to update checksums in neovim.yaml
# This fetches checksums for all platforms for a given version

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Usage: ./update-checksums.sh <version>"
    echo "Example: ./update-checksums.sh 0.10.0"
    exit 1
fi

echo "Fetching checksums for neovim ${VERSION}..."

# Fetch checksums for each platform
for platform in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64; do
    case $platform in
        linux-amd64) FILE="nvim-linux-x86_64.tar.gz" ;;
        linux-arm64) FILE="nvim-linux-aarch64.tar.gz" ;;
        darwin-amd64) FILE="nvim-macos-x86_64.tar.gz" ;;
        darwin-arm64) FILE="nvim-macos-arm64.tar.gz" ;;
        windows-amd64) FILE="nvim-win64.zip" ;;
    esac
    
    URL="https://github.com/neovim/neovim/releases/download/v${VERSION}/${FILE}"
    CHECKSUM=$(curl -sL "${URL}" 2>/dev/null | shasum -a 256 | awk '{print "sha256:" $1}')
    
    if [ -n "$CHECKSUM" ] && [ "$CHECKSUM" != "sha256:" ]; then
        echo "  ${platform}: ${CHECKSUM}"
        # Update the YAML file (this is a simple sed replacement - in production you'd use a proper YAML parser)
        # For now, we'll just output the checksums
    else
        echo "  ${platform}: Failed to fetch"
    fi
done

