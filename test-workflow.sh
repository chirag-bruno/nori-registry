#!/bin/bash
# Script to test GitHub Actions workflows locally using act

set -e

WORKFLOW=${1:-".github/workflows/update-neovim.yml"}
EVENT=${2:-"workflow_dispatch"}

echo "Testing workflow: $WORKFLOW"
echo "Event: $EVENT"
echo ""

# Check if Docker is running
if ! docker ps >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  GITHUB_TOKEN not set. Some workflows may fail without it."
    echo "   Set it with: export GITHUB_TOKEN='your_token_here'"
    echo ""
fi

# Run act
echo "🚀 Running act..."
echo ""

if [ -n "$GITHUB_TOKEN" ]; then
    act -W "$WORKFLOW" "$EVENT" \
        --container-architecture linux/amd64 \
        --secret GITHUB_TOKEN="$GITHUB_TOKEN" \
        --env GITHUB_TOKEN="$GITHUB_TOKEN"
else
    act -W "$WORKFLOW" "$EVENT" \
        --container-architecture linux/amd64
fi

