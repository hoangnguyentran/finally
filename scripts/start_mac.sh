#!/usr/bin/env bash
# Start FinAlly in Docker (macOS / Linux). Safe to run repeatedly.
#
#   ./scripts/start_mac.sh              build if the image is missing, then run
#   ./scripts/start_mac.sh --build      force a rebuild
#   ./scripts/start_mac.sh --no-browser don't open a browser
#
# Env overrides: PORT (default 8000), IMAGE, CONTAINER, VOLUME.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${IMAGE:-finally:latest}"
CONTAINER="${CONTAINER:-finally}"
VOLUME="${VOLUME:-finally-data}"
PORT="${PORT:-8000}"

FORCE_BUILD=false
OPEN_BROWSER=true
for arg in "$@"; do
  case "$arg" in
    --build) FORCE_BUILD=true ;;
    --no-browser) OPEN_BROWSER=false ;;
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install Docker Desktop: https://docker.com/products/docker-desktop" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start Docker Desktop and try again." >&2
  exit 1
fi

if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "No .env found — creating one from .env.example."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
  echo "Edit $REPO_ROOT/.env and add your OPENROUTER_API_KEY for AI chat to work."
fi

mkdir -p "$REPO_ROOT/db"

if [ "$FORCE_BUILD" = true ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE ..."
  docker build -t "$IMAGE" "$REPO_ROOT"
fi

# Remove any previous container so a re-run picks up the current image.
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Removing existing container '$CONTAINER' ..."
  docker rm -f "$CONTAINER" >/dev/null
fi

echo "Starting $CONTAINER on port $PORT ..."
docker run -d \
  --name "$CONTAINER" \
  -p "${PORT}:8000" \
  --env-file "$REPO_ROOT/.env" \
  -e DATABASE_PATH=/app/db/finally.db \
  -v "${VOLUME}:/app/db" \
  --restart unless-stopped \
  "$IMAGE" >/dev/null

URL="http://localhost:${PORT}"

printf 'Waiting for FinAlly to come up '
for _ in $(seq 1 60); do
  if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo
    echo "Container exited during startup. Logs:" >&2
    docker logs "$CONTAINER" >&2 || true
    exit 1
  fi
  printf '.'
  sleep 1
done
echo

echo "FinAlly is running at ${URL}"
echo "Logs:  docker logs -f ${CONTAINER}"
echo "Stop:  ./scripts/stop_mac.sh"

if [ "$OPEN_BROWSER" = true ] && command -v open >/dev/null 2>&1; then
  open "$URL"
fi
