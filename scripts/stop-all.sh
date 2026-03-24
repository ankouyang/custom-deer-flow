#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

source "$REPO_ROOT/scripts/service-utils.sh"

export PATH="$HOME/Library/Python/3.12/bin:$PATH"

stop_deerflow_services "$REPO_ROOT"
