#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

mkdir -p .githooks
chmod +x .githooks/post-checkout
chmod +x .githooks/post-merge
chmod +x .githooks/post-rewrite
git config --local core.hooksPath .githooks

echo "Configured git hooks path:"
git config --local --get core.hooksPath
echo "Enabled hook:"
echo "  .githooks/post-checkout"
echo "  .githooks/post-merge"
echo "  .githooks/post-rewrite"
