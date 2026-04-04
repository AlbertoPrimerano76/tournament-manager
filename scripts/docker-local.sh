#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-up}"

case "$ACTION" in
  up)
    docker compose up --build -d
    ;;
  down)
    docker compose down
    ;;
  reset)
    docker compose down -v
    docker compose up --build -d
    ;;
  logs)
    docker compose logs -f
    ;;
  ps)
    docker compose ps
    ;;
  *)
    echo "Uso: $0 {up|down|reset|logs|ps}"
    exit 1
    ;;
esac
