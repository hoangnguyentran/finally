#!/usr/bin/env bash
# Stop FinAlly (macOS / Linux). Safe to run repeatedly.
# The named volume is kept, so the portfolio database survives.
#
# Env overrides: CONTAINER (default "finally").

set -euo pipefail

CONTAINER="${CONTAINER:-finally}"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running — nothing to stop."
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Stopping and removing container '$CONTAINER' ..."
  docker rm -f "$CONTAINER" >/dev/null
  echo "Stopped. Your data is preserved in the 'finally-data' volume."
else
  echo "Container '$CONTAINER' is not running."
fi
