#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

source "$REPO_ROOT/scripts/service-utils.sh"

export PATH="$HOME/Library/Python/3.12/bin:$PATH"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy

uv_cmd() {
  if command -v uv >/dev/null 2>&1; then
    uv "$@"
  else
    python3 -m uv "$@"
  fi
}

cleanup() {
  trap - INT TERM EXIT
  if [ -n "${LANGGRAPH_PID:-}" ] && kill -0 "$LANGGRAPH_PID" 2>/dev/null; then
    kill "$LANGGRAPH_PID" 2>/dev/null || true
  fi
  if [ -n "${GATEWAY_PID:-}" ] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

kill_matching_processes "langgraph dev"
kill_matching_processes "uvicorn app.gateway.app:app"
kill_port_listener 2024
kill_port_listener 8001
wait_for_port_release 2024 10 || true
wait_for_port_release 8001 10 || true

mkdir -p logs

echo "Starting LangGraph on http://localhost:2024"
(
  cd backend
  NO_COLOR=1 uv_cmd run langgraph dev --no-browser --allow-blocking > ../logs/langgraph.log 2>&1
) &
LANGGRAPH_PID=$!

"$REPO_ROOT/scripts/wait-for-port.sh" 2024 60 "LangGraph"

echo "Starting Gateway API on http://localhost:8001"
(
  cd backend
  PYTHONPATH=. uv_cmd run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --reload --reload-include='*.yaml' --reload-include='.env' > ../logs/gateway.log 2>&1
) &
GATEWAY_PID=$!

"$REPO_ROOT/scripts/wait-for-port.sh" 8001 30 "Gateway API"

echo "Backend is running"
echo "  LangGraph: http://localhost:2024"
echo "  Gateway:   http://localhost:8001"
echo "  Logs: logs/langgraph.log, logs/gateway.log"

wait "$LANGGRAPH_PID" "$GATEWAY_PID"
