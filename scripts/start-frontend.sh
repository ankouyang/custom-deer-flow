#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/service-utils.sh"

cd "$REPO_ROOT/frontend"

unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy

echo "Generating Prisma client..."
pnpm exec prisma generate

kill_matching_processes "next dev"
kill_matching_processes "next start"
kill_matching_processes "next-server"
kill_port_listener 3000
wait_for_port_release 3000 10 || true

echo "Starting frontend on http://localhost:3000"
exec pnpm dev
