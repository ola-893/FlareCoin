#!/usr/bin/env bash
#
# start-docker.sh — Bring up the FCE Extension Scaffold Docker stack.
#
# Started by `npm run start` (via `npm run docker:up`) so that one command
# launches EVERYTHING: the Docker TEE stack + frontend + executor + FCE + ngrok.
#
# Locates the scaffold either inside the repo (./fce-extension-scaffold) or as
# a sibling directory (../fce-extension-scaffold), then runs the Coston2
# compose stack detached. Safe to re-run (containers are left running).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Locate the scaffold -----------------------------------------------------
SCAFFOLD=""
for candidate in "$SCRIPT_DIR/fce-extension-scaffold" "$SCRIPT_DIR/../fce-extension-scaffold"; do
    if [[ -d "$candidate" && -f "$candidate/docker-compose.yaml" ]]; then
        SCAFFOLD="$(cd "$candidate" && pwd)"
        break
    fi
done

if [[ -z "$SCAFFOLD" ]]; then
    echo "[docker:up] WARNING: fce-extension-scaffold not found (checked repo dir and ../). Skipping Docker services."
    exit 0
fi

if ! command -v docker &>/dev/null; then
    echo "[docker:up] WARNING: docker not found. Skipping Docker services."
    exit 0
fi

if [[ ! -f "$SCAFFOLD/.env" ]]; then
    echo "[docker:up] WARNING: .env missing in $SCAFFOLD — skipping Docker services."
    exit 0
fi

cd "$SCAFFOLD"

# --- Heal stale networks that Compose would refuse to reuse ------------------
# Compose only adopts an existing network if it carries its own
# com.docker.compose.* labels; a leftover network (e.g. created outside
# compose, or by an aborted run) has no/foreign labels and makes `up` fail
# with: "network ... has incorrect label com.docker.compose.network set to
# \"\" (expected: \"default\")".
NETWORK_NAME="${COMPOSE_NETWORK:-extension-scaffold-coston2}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
if docker network inspect "$NETWORK_NAME" &>/dev/null; then
    NET_LABEL="$(docker network inspect "$NETWORK_NAME" --format '{{index .Labels "com.docker.compose.network"}}' 2>/dev/null || true)"
    NET_PROJECT="$(docker network inspect "$NETWORK_NAME" --format '{{index .Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
    if [[ "$NET_LABEL" != "default" || "$NET_PROJECT" != "$COMPOSE_PROJECT" ]]; then
        echo "[docker:up] Removing stale network '$NETWORK_NAME' so Compose can recreate it..."
        docker network rm "$NETWORK_NAME" 2>/dev/null \
            || echo "[docker:up] WARNING: could not remove '$NETWORK_NAME' (containers may be attached). Run: docker network disconnect --force <container> '$NETWORK_NAME' and retry."
    fi
fi

# --- Start the Coston2 stack (detached) --------------------------------------
echo "[docker:up] Starting FCE scaffold Docker services (mysql, redis, ext-proxy, extension-tee)..."
docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml up -d

if docker compose exec -T redis redis-cli ping &>/dev/null; then
    echo "[docker:up] Redis ready"
else
    echo "[docker:up] WARNING: Redis not responding yet"
fi

echo "[docker:up] Docker services are up."
