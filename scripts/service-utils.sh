#!/usr/bin/env bash

set -euo pipefail

kill_matching_processes() {
  local pattern="$1"

  pkill -TERM -f "$pattern" 2>/dev/null || true
  sleep 1
  pkill -KILL -f "$pattern" 2>/dev/null || true
}

kill_port_listener() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  fi

  if [ -z "$pids" ]; then
    return 0
  fi

  kill -TERM $pids 2>/dev/null || true
  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill -KILL $pids 2>/dev/null || true
  fi
}

wait_for_port_release() {
  local port="$1"
  local timeout="${2:-10}"
  local elapsed=0

  while [ "$elapsed" -lt "$timeout" ]; do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

stop_deerflow_services() {
  local repo_root="$1"

  echo "Stopping DeerFlow services..."

  kill_matching_processes "langgraph dev"
  kill_matching_processes "uvicorn app.gateway.app:app"
  kill_matching_processes "next dev"
  kill_matching_processes "next start"
  kill_matching_processes "next-server"

  nginx -c "$repo_root/docker/nginx/nginx.local.conf" -p "$repo_root" -s quit 2>/dev/null || true
  sleep 1
  pkill -KILL nginx 2>/dev/null || true

  kill_port_listener 2024
  kill_port_listener 8001
  kill_port_listener 3000
  kill_port_listener 2026

  wait_for_port_release 2024 10 || true
  wait_for_port_release 8001 10 || true
  wait_for_port_release 3000 10 || true
  wait_for_port_release 2026 10 || true

  echo "Cleaning up sandbox containers..."
  "$repo_root/scripts/cleanup-containers.sh" deer-flow-sandbox 2>/dev/null || true
  echo "✓ All DeerFlow services stopped"
}
